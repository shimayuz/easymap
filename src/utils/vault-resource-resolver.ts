import type { App, TFile } from 'obsidian'
import type { MindElixirNodeData } from '../types'

export function resolveVaultImageUrl(
  app: App,
  rawPath: string,
  sourceFile: TFile
): string | null {
  const file = app.metadataCache.getFirstLinkpathDest(rawPath, sourceFile.path)
  if (!file) return null

  return app.vault.getResourcePath(file)
}

export function resolveVaultLinkUrl(
  app: App,
  rawTarget: string,
  sourceFile: TFile
): string {
  const file = app.metadataCache.getFirstLinkpathDest(rawTarget, sourceFile.path)
  if (file) {
    const vaultName = encodeURIComponent(app.vault.getName())
    const filePath = encodeURIComponent(file.path)
    return `obsidian://open?vault=${vaultName}&file=${filePath}`
  }
  const vaultName = encodeURIComponent(app.vault.getName())
  const targetPath = encodeURIComponent(rawTarget)
  return `obsidian://open?vault=${vaultName}&file=${targetPath}`
}

export function resolveNodeImages(
  nodeData: MindElixirNodeData,
  app: App,
  sourceFile: TFile
): MindElixirNodeData {
  return resolveNodeRecursive(nodeData, app, sourceFile)
}

function resolveNodeRecursive(
  node: MindElixirNodeData,
  app: App,
  sourceFile: TFile
): MindElixirNodeData {
  let resolvedImage = node.image
  let resolvedHyperLink = node.hyperLink

  if (node.imageMeta?.type === 'vault' && node.image) {
    const resolvedUrl = resolveVaultImageUrl(app, node.imageMeta.rawPath, sourceFile)
    if (resolvedUrl) {
      resolvedImage = { ...node.image, url: resolvedUrl }
    }
  }

  if (node.linkMeta?.type === 'wiki' || node.linkMeta?.type === 'wiki-alias') {
    resolvedHyperLink = resolveVaultLinkUrl(app, node.linkMeta.rawTarget, sourceFile)
  }

  let resolvedChildren = node.children
  if (node.children) {
    const mapped = node.children.map((child) => resolveNodeRecursive(child, app, sourceFile))
    const hasChildDiff = mapped.some((child, i) => child !== node.children![i])
    resolvedChildren = hasChildDiff ? mapped : node.children
  }

  const hasImageChange = resolvedImage !== node.image
  const hasLinkChange = resolvedHyperLink !== node.hyperLink
  const hasChildrenChange = resolvedChildren !== node.children

  if (!hasImageChange && !hasLinkChange && !hasChildrenChange) {
    return node
  }

  return {
    ...node,
    ...(hasImageChange ? { image: resolvedImage } : {}),
    ...(hasLinkChange ? { hyperLink: resolvedHyperLink } : {}),
    ...(hasChildrenChange ? { children: resolvedChildren } : {}),
  }
}
