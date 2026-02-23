import type { MindElixirNodeData } from '../types'
import { BULLET_ID_PREFIX } from './markdown-parser'
import { escapeMarkdownBrackets, escapeWikiLinkContent } from '../utils/sanitize'

export class MarkdownWriter {
  toMarkdown(
    nodeData: MindElixirNodeData,
    frontmatter: string | null
  ): string {
    const lines: string[] = []

    if (frontmatter) {
      lines.push('---')
      lines.push(frontmatter)
      lines.push('---')
      lines.push('')
    }

    this.writeNode(nodeData, 0, lines)

    return lines.join('\n')
  }

  private writeNode(
    node: MindElixirNodeData,
    depth: number,
    lines: string[]
  ): void {
    if (depth > 0) {
      // Bullet nodes are handled by writeBulletTree; skip if reached unexpectedly
      if (node.id.startsWith(BULLET_ID_PREFIX)) return

      if (depth <= 6) {
        const prefix = '#'.repeat(depth)
        lines.push(`${prefix} ${node.topic}`)
      } else {
        const indent = '  '.repeat(depth - 7)
        lines.push(`${indent}- ${node.topic}`)
      }

      // notes (段落テキスト) を書き出し
      if (node.notes) {
        lines.push('')
        lines.push(node.notes)
      }

      // 画像メタデータからMarkdown行を生成
      this.writeImageLine(node, lines)

      // リンクメタデータからMarkdown行を生成
      this.writeLinkLine(node, lines)

      // 箇条書き子ノードを先に書き出し (見出し子ノードの前)
      const bulletChildren = (node.children || []).filter((c) =>
        c.id.startsWith(BULLET_ID_PREFIX)
      )
      if (bulletChildren.length > 0) {
        lines.push('')
        for (const bullet of bulletChildren) {
          this.writeBulletTree(bullet, 0, lines)
        }
      }

      lines.push('')

      // 見出し子ノードを書き出し
      const headingChildren = (node.children || []).filter(
        (c) => !c.id.startsWith(BULLET_ID_PREFIX)
      )
      for (const child of headingChildren) {
        this.writeNode(child, depth + 1, lines)
      }
    } else {
      // root ノード (depth=0): 子を順番に書き出し
      if (node.notes) {
        lines.push(node.notes)
        lines.push('')
      }

      // root直下の箇条書き
      const bulletChildren = (node.children || []).filter((c) =>
        c.id.startsWith(BULLET_ID_PREFIX)
      )
      if (bulletChildren.length > 0) {
        for (const bullet of bulletChildren) {
          this.writeBulletTree(bullet, 0, lines)
        }
        lines.push('')
      }

      // root直下の見出しノード
      const headingChildren = (node.children || []).filter(
        (c) => !c.id.startsWith(BULLET_ID_PREFIX)
      )
      for (const child of headingChildren) {
        this.writeNode(child, depth + 1, lines)
      }
    }
  }

  private writeImageLine(node: MindElixirNodeData, lines: string[]): void {
    if (!node.imageMeta) return

    lines.push('')
    if (node.imageMeta.type === 'vault') {
      const safePath = escapeWikiLinkContent(node.imageMeta.rawPath)
      lines.push(`![[${safePath}]]`)
    } else {
      const safeAlt = escapeMarkdownBrackets(node.imageMeta.alt || '')
      const safePath = escapeMarkdownBrackets(node.imageMeta.rawPath)
      lines.push(`![${safeAlt}](${safePath})`)
    }
  }

  private writeLinkLine(node: MindElixirNodeData, lines: string[]): void {
    if (!node.linkMeta) return

    lines.push('')
    switch (node.linkMeta.type) {
      case 'wiki': {
        const safeTarget = escapeWikiLinkContent(node.linkMeta.rawTarget)
        lines.push(`[[${safeTarget}]]`)
        break
      }
      case 'wiki-alias': {
        const safeTarget = escapeWikiLinkContent(node.linkMeta.rawTarget)
        const safeDisplay = escapeWikiLinkContent(node.linkMeta.displayText || node.topic)
        lines.push(`[[${safeTarget}|${safeDisplay}]]`)
        break
      }
      case 'external': {
        const safeTopic = escapeMarkdownBrackets(node.topic)
        const safeTarget = escapeMarkdownBrackets(node.linkMeta.rawTarget)
        lines.push(`[${safeTopic}](${safeTarget})`)
        break
      }
    }
  }

  /**
   * 箇条書きノードツリーを Markdown の bullet リストとして書き出す
   */
  private writeBulletTree(
    node: MindElixirNodeData,
    indentLevel: number,
    lines: string[]
  ): void {
    const indent = '  '.repeat(indentLevel)
    const bulletText = this.formatBulletText(node)
    lines.push(`${indent}- ${bulletText}`)

    if (node.children) {
      for (const child of node.children) {
        this.writeBulletTree(child, indentLevel + 1, lines)
      }
    }
  }

  private formatBulletText(node: MindElixirNodeData): string {
    if (node.imageMeta) {
      if (node.imageMeta.type === 'vault') {
        const safePath = escapeWikiLinkContent(node.imageMeta.rawPath)
        return `![[${safePath}]]`
      }
      const safeAlt = escapeMarkdownBrackets(node.imageMeta.alt || '')
      const safePath = escapeMarkdownBrackets(node.imageMeta.rawPath)
      return `![${safeAlt}](${safePath})`
    }

    if (node.linkMeta) {
      switch (node.linkMeta.type) {
        case 'wiki': {
          const safeTarget = escapeWikiLinkContent(node.linkMeta.rawTarget)
          return `[[${safeTarget}]]`
        }
        case 'wiki-alias': {
          const safeTarget = escapeWikiLinkContent(node.linkMeta.rawTarget)
          const safeDisplay = escapeWikiLinkContent(node.linkMeta.displayText || node.topic)
          return `[[${safeTarget}|${safeDisplay}]]`
        }
        case 'external': {
          const safeTopic = escapeMarkdownBrackets(node.topic)
          const safeTarget = escapeMarkdownBrackets(node.linkMeta.rawTarget)
          return `[${safeTopic}](${safeTarget})`
        }
      }
    }

    return node.topic
  }
}
