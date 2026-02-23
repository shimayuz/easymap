import type { MindElixirNodeData } from '../types'
import { BULLET_ID_PREFIX } from './markdown-parser'

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
    const isBulletNode = node.id.startsWith(BULLET_ID_PREFIX)

    if (depth > 0) {
      if (isBulletNode) {
        // 箇条書き由来ノード → bullet として書き出し
        // ネスト深さは bulletDepth で管理 (親からの相対)
        // ここでは呼び出し元が indent を制御する
        // → writeBulletTree で処理するため、ここには来ない
      } else if (depth <= 6) {
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
      // root の notes があれば先頭に
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

  /**
   * 箇条書きノードツリーを Markdown の bullet リストとして書き出す
   */
  private writeBulletTree(
    node: MindElixirNodeData,
    indentLevel: number,
    lines: string[]
  ): void {
    const indent = '  '.repeat(indentLevel)
    lines.push(`${indent}- ${node.topic}`)

    if (node.children) {
      for (const child of node.children) {
        this.writeBulletTree(child, indentLevel + 1, lines)
      }
    }
  }
}
