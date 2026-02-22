import type { MindElixirNodeData } from '../types'

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
      if (depth <= 6) {
        const prefix = '#'.repeat(depth)
        lines.push(`${prefix} ${node.topic}`)
      } else {
        const indent = '  '.repeat(depth - 7)
        lines.push(`${indent}- ${node.topic}`)
      }

      if (node.notes) {
        lines.push('')
        lines.push(node.notes)
      }

      lines.push('')
    }

    if (node.children) {
      for (const child of node.children) {
        this.writeNode(child, depth + 1, lines)
      }
    }
  }
}
