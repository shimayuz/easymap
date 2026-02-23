import type { MindElixirNodeData, MindElixirData, ParsedMarkdown, MarkdownSection } from '../types'
import { generateNodeId } from '../utils/id-generator'

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
   * ポイント:
   * - ドキュメントの最小見出しレベルを検出し、それを「depth 1」として正規化する
   *   (H1がなくH2始まりなら H2=depth1, H3=depth2, ...)
   * - レベルの飛び (H2→H4 など) があっても、直近の親に吸収する
   * - ルートノードはファイル名で、常に depth 0
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

    // 最小見出しレベルを検出 (H1がなければ H2 が最小 = depth 1 に対応)
    const minLevel = sections.reduce(
      (min, s) => Math.min(min, s.level),
      6
    )

    // ミュータブルなツリー構築用ノード
    interface MutableNode {
      id: string
      topic: string
      expanded: boolean
      children: MutableNode[]
      notes?: string
      depth: number // 構築用の深さ (root=0, 最小レベル見出し=1, ...)
    }

    const root: MutableNode = {
      id: 'root',
      topic: rootTopic,
      expanded: true,
      children: [],
      depth: 0,
    }

    // スタック: 現在の祖先チェーン。常に root がスタック底にいる
    const stack: MutableNode[] = [root]

    for (const section of sections) {
      // 正規化: ドキュメント内の最小レベルを depth 1 にマッピング
      const depth = section.level - minLevel + 1

      const node: MutableNode = {
        id: generateNodeId(section.heading, section.level),
        topic: section.heading,
        expanded: true,
        children: [],
        notes: section.content || undefined,
        depth,
      }

      // スタックから、この node の親になれる位置まで巻き戻す
      // 親 = depth が自分より小さい最も近い祖先
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop()
      }

      // スタック先頭が親
      const parent = stack[stack.length - 1]
      parent.children.push(node)

      stack.push(node)
    }

    return this.toImmutable(root)
  }

  /** 構築用ミュータブルノードを readonly な MindElixirNodeData に変換 */
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
