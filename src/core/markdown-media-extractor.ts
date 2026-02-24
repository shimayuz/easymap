export interface ExtractedImage {
  readonly alt: string
  readonly url: string
  readonly type: 'external' | 'vault'
  readonly raw: string
}

export interface ExtractedLink {
  readonly text: string
  readonly url: string
  readonly type: 'external' | 'wiki' | 'wiki-alias'
  readonly rawTarget: string
  readonly displayText?: string
}

export interface MediaExtraction {
  readonly images: readonly ExtractedImage[]
  readonly links: readonly ExtractedLink[]
  readonly bulletLines: readonly string[]
  readonly paragraphLines: readonly string[]
}

// Shared regex patterns: \s*$ tolerates trailing whitespace for line-level matching.
// extractBulletMedia receives pre-trimmed text, so \s* has no effect but keeps patterns unified.
const EXTERNAL_IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/
const VAULT_IMAGE_RE = /^!\[\[([^\]|]+)\]\]\s*$/
const EXTERNAL_LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)\s*$/
const WIKI_ALIAS_RE = /^\[\[([^\]|]+)\|([^\]]+)\]\]\s*$/
const WIKI_LINK_RE = /^\[\[([^\]|]+)\]\]\s*$/
const BULLET_RE = /^(\s*)(?:[-*]|\d+\.)\s+(.+)$/
const CODE_FENCE_RE = /^(`{3,}|~{3,})/

export interface BulletMediaResult {
  readonly text: string
  readonly image?: ExtractedImage
  readonly link?: ExtractedLink
}

export function extractBulletMedia(text: string): BulletMediaResult {
  const externalImageMatch = text.match(EXTERNAL_IMAGE_RE)
  if (externalImageMatch) {
    return {
      text: externalImageMatch[1] || externalImageMatch[2],
      image: {
        alt: externalImageMatch[1],
        url: externalImageMatch[2],
        type: 'external',
        raw: text,
      },
    }
  }

  const vaultImageMatch = text.match(VAULT_IMAGE_RE)
  if (vaultImageMatch) {
    return {
      text: vaultImageMatch[1],
      image: {
        alt: vaultImageMatch[1],
        url: vaultImageMatch[1],
        type: 'vault',
        raw: text,
      },
    }
  }

  const externalLinkMatch = text.match(EXTERNAL_LINK_RE)
  if (externalLinkMatch) {
    return {
      text: externalLinkMatch[1],
      link: {
        text: externalLinkMatch[1],
        url: externalLinkMatch[2],
        type: 'external',
        rawTarget: externalLinkMatch[2],
      },
    }
  }

  const wikiAliasMatch = text.match(WIKI_ALIAS_RE)
  if (wikiAliasMatch) {
    return {
      text: wikiAliasMatch[2],
      link: {
        text: wikiAliasMatch[2],
        url: wikiAliasMatch[1],
        type: 'wiki-alias',
        rawTarget: wikiAliasMatch[1],
        displayText: wikiAliasMatch[2],
      },
    }
  }

  const wikiLinkMatch = text.match(WIKI_LINK_RE)
  if (wikiLinkMatch) {
    return {
      text: wikiLinkMatch[1],
      link: {
        text: wikiLinkMatch[1],
        url: wikiLinkMatch[1],
        type: 'wiki',
        rawTarget: wikiLinkMatch[1],
      },
    }
  }

  return { text }
}

export function extractMedia(content: string): MediaExtraction {
  if (!content) {
    return { images: [], links: [], bulletLines: [], paragraphLines: [] }
  }

  const lines = content.split('\n')
  const images: ExtractedImage[] = []
  const links: ExtractedLink[] = []
  const bulletLines: string[] = []
  const paragraphLines: string[] = []
  let inCodeBlock = false

  for (const line of lines) {
    // コードフェンス (``` or ~~~) の開始/終了を追跡
    if (CODE_FENCE_RE.test(line)) {
      inCodeBlock = !inCodeBlock
      paragraphLines.push(line)
      continue
    }

    // コードブロック内はすべて段落テキストとして扱う
    if (inCodeBlock) {
      paragraphLines.push(line)
      continue
    }

    if (BULLET_RE.test(line)) {
      bulletLines.push(line)
      continue
    }

    const externalImageMatch = line.match(EXTERNAL_IMAGE_RE)
    if (externalImageMatch) {
      images.push({
        alt: externalImageMatch[1],
        url: externalImageMatch[2],
        type: 'external',
        raw: line.trim(),
      })
      continue
    }

    const vaultImageMatch = line.match(VAULT_IMAGE_RE)
    if (vaultImageMatch) {
      images.push({
        alt: vaultImageMatch[1],
        url: vaultImageMatch[1],
        type: 'vault',
        raw: line.trim(),
      })
      continue
    }

    const externalLinkMatch = line.match(EXTERNAL_LINK_RE)
    if (externalLinkMatch) {
      links.push({
        text: externalLinkMatch[1],
        url: externalLinkMatch[2],
        type: 'external',
        rawTarget: externalLinkMatch[2],
      })
      continue
    }

    const wikiAliasMatch = line.match(WIKI_ALIAS_RE)
    if (wikiAliasMatch) {
      links.push({
        text: wikiAliasMatch[2],
        url: wikiAliasMatch[1],
        type: 'wiki-alias',
        rawTarget: wikiAliasMatch[1],
        displayText: wikiAliasMatch[2],
      })
      continue
    }

    const wikiLinkMatch = line.match(WIKI_LINK_RE)
    if (wikiLinkMatch) {
      links.push({
        text: wikiLinkMatch[1],
        url: wikiLinkMatch[1],
        type: 'wiki',
        rawTarget: wikiLinkMatch[1],
      })
      continue
    }

    paragraphLines.push(line)
  }

  return { images, links, bulletLines, paragraphLines }
}
