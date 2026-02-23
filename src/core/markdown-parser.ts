import type { MindElixirNodeData, MindElixirData, ParsedMarkdown, MarkdownSection } from '../types'
import { generateNodeId, generateRandomId } from '../utils/id-generator'

/** 箇条書き由来ノードの ID プレフィックス */
export const BULLET_ID_PREFIX = 'emb_'

export class MarkdownParser {
  parse(content: string): ParsedMarkdown {
    const frontmatter = this.extractFrontmatter(content)
    const bodyContent = this.removeFrontmatter(content)
    const sections = this.extractSections(bodyContent)

    return {
      frontmatter,
      sections,
      rawContent: content,
    }
  }

  toMindElixirData(content: string, fileName: string): MindElixirData {
    const parsed = this.parse(content)
    const rootTopic = fileName.replace(/\.md$/, '')
    const rootNode = this.buildTree(parsed.sections, rootTopic)

    return { nodeData: rootNode }
  }

  private extractFrontmatter(content: string): string | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    return match ? match[1] : null
  }

  private removeFrontmatter(content: string): string {
    return content.replace(/^---\n[\s\S]*?\n---\n?/, '')
  }

  private extractSections(content: string): MarkdownSection[] {
    const lines = content.split('\n')
    const sections: MarkdownSection[] = []
    let currentSection: {
      heading: string
      level: number
      content: string
      lineStart: number
      lineEnd: number
    } | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)

      if (headingMatch) {
        if (currentSection) {
          sections.push({
            ...currentSection,
            lineEnd: i - 1,
            content: currentSection.content.trim(),
          })
        }

        currentSection = {
          heading: headingMatch[2],
          level: headingMatch[1].length,
          content: '',
          lineStart: i,
          lineEnd: i,
        }
      } else if (currentSection) {
        currentSection.content += (currentSection.content ? '\n' : '') + line
      }
    }

    if (currentSection) {
      sections.push({
        ...currentSection,
        lineEnd: lines.length - 1,
        content: currentSection.content.trim(),
      })
    }

    return sections
  }

  /**
   * セクション配列からマインドマップツリーを構築する。
   *
   * - ドキュメントの最小見出しレベルを検出し正規化
   * - 各セクションの本文から箇条書きを子ノードとして抽出
   * - 残りの段落テキストは notes に保持
   */
  private buildTree(
    sections: readonly MarkdownSection[],
    rootTopic: string
  ): MindElixirNodeData {
    if (sections.length === 0) {
      return {
        id: 'root',
        topic: rootTopic,
        expanded: true,
        children: [],
      }
    }

    const minLevel = sections.reduce(
      (min, s) => Math.min(min, s.level),
      6
    )

    interface MutableNode {
      id: string
      topic: string
      expanded: boolean
      children: MutableNode[]
      notes?: string
      depth: number
    }

    const root: MutableNode = {
      id: 'root',
      topic: rootTopic,
      expanded: true,
      children: [],
      depth: 0,
    }

    const stack: MutableNode[] = [root]

    for (const section of sections) {
      const depth = section.level - minLevel + 1

      // 本文から箇条書きノードと段落テキストを分離
      const { bulletNodes, paragraphText } = this.parseSectionContent(section.content)

      const node: MutableNode = {
        id: generateNodeId(section.heading, section.level),
        topic: section.heading,
        expanded: true,
        children: bulletNodes,
        notes: paragraphText || undefined,
        depth,
      }

      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop()
      }

      const parent = stack[stack.length - 1]
      parent.children.push(node)
      stack.push(node)
    }

    return this.toImmutable(root)
  }

  /**
   * セクション本文を解析し、箇条書きと段落テキストに分離する。
   *
   * 箇条書き: `- item`, `* item`, `1. item` (ネスト対応)
   * それ以外: 段落テキストとして notes に保持
   */
  private parseSectionContent(content: string): {
    bulletNodes: Array<{
      id: string
      topic: string
      expanded: boolean
      children: Array<{ id: string; topic: string; expanded: boolean; children: never[]; depth: number }>
      depth: number
    }>
    paragraphText: string
  } {
    if (!content) {
      return { bulletNodes: [], paragraphText: '' }
    }

    const lines = content.split('\n')
    const bulletNodes: Array<{
      id: string
      topic: string
      expanded: boolean
      children: Array<{ id: string; topic: string; expanded: boolean; children: never[]; depth: number }>
      depth: number
    }> = []
    const paragraphLines: string[] = []

    // 箇条書きパース用スタック: [{ node, indentLevel }]
    const bulletStack: Array<{
      node: typeof bulletNodes[0]
      indent: number
    }> = []

    for (const line of lines) {
      const bulletMatch = line.match(/^(\s*)(?:[-*]|\d+\.)\s+(.+)$/)

      if (bulletMatch) {
        const indent = bulletMatch[1].length
        const text = bulletMatch[2].trim()

        const bulletNode = {
          id: BULLET_ID_PREFIX + generateRandomId().substring(3),
          topic: text,
          expanded: true,
          children: [] as Array<{ id: string; topic: string; expanded: boolean; children: never[]; depth: number }>,
          depth: 999, // 箇条書きは depth 管理しない
        }

        // インデントに基づいてネスト判定
        while (bulletStack.length > 0 && bulletStack[bulletStack.length - 1].indent >= indent) {
          bulletStack.pop()
        }

        if (bulletStack.length > 0) {
          // 親の箇条書きの子に追加
          bulletStack[bulletStack.length - 1].node.children.push(bulletNode as typeof bulletStack[0]['node']['children'][0])
        } else {
          // トップレベル箇条書き
          bulletNodes.push(bulletNode)
        }

        bulletStack.push({ node: bulletNode, indent })
      } else {
        // 箇条書きでない行 → 段落テキスト
        // 箇条書きのパースを中断 (段落が来たらスタックリセット)
        if (line.trim()) {
          bulletStack.length = 0
        }
        paragraphLines.push(line)
      }
    }

    const paragraphText = paragraphLines.join('\n').trim()
    return { bulletNodes, paragraphText }
  }

  private toImmutable(node: {
    id: string
    topic: string
    expanded: boolean
    children: Array<{ id: string; topic: string; expanded: boolean; children: unknown[]; notes?: string }>
    notes?: string
  }): MindElixirNodeData {
    return {
      id: node.id,
      topic: node.topic,
      expanded: node.expanded,
      children: node.children.map((child) => this.toImmutable(child as typeof node)),
      notes: node.notes,
    }
  }
}
