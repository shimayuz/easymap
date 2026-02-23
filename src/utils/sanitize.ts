const ALLOWED_PROTOCOLS = ['http:', 'https:', 'obsidian:']

export function isValidMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_PROTOCOLS.includes(parsed.protocol)
  } catch {
    return false
  }
}

export function isValidVaultPath(path: string): boolean {
  return !path.includes('..') && !path.startsWith('/')
}

export function escapeMarkdownBrackets(text: string): string {
  return text.replace(/[\[\]()]/g, '\\$&')
}

export function escapeWikiLinkContent(text: string): string {
  return text.replace(/[\[\]|]/g, '')
}
