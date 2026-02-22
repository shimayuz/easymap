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

  private buildTree(
    sections: readonly MarkdownSection[],
    rootTopic: string
  ): MindElixirNodeData {
    const root: MindElixirNodeData = {
      id: 'root',
      topic: rootTopic,
      expanded: true,
      children: [],
    }

    if (sections.length === 0) {
      return root
    }

    const stack: Array<{ node: MindElixirNodeData; level: number }> = [
      { node: root, level: 0 },
    ]

    for (const section of sections) {
      const newNode: MindElixirNodeData = {
        id: generateNodeId(section.heading, section.level),
        topic: section.heading,
        expanded: true,
        children: [],
        notes: section.content || undefined,
      }

      while (stack.length > 1 && stack[stack.length - 1].level >= section.level) {
        stack.pop()
      }

      const parent = stack[stack.length - 1].node
      const updatedChildren = [...(parent.children || []), newNode]
      const updatedParent = { ...parent, children: updatedChildren }

      if (stack.length === 1) {
        Object.assign(root, updatedParent)
      } else {
        const grandParent = stack[stack.length - 2].node
        const grandParentChildren = (grandParent.children || []).map((child) =>
          child.id === parent.id ? updatedParent : child
        )
        Object.assign(grandParent, { children: grandParentChildren })
      }

      stack.push({ node: newNode, level: section.level })
    }

    return root
  }
}
