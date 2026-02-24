import type {
  MindElixirNodeData,
  MindElixirData,
  ParsedMarkdown,
  MarkdownSection,
  NodeImage,
  LinkMeta,
  ImageMeta,
} from '../types'
import { DEFAULT_NODE_IMAGE_WIDTH, DEFAULT_NODE_IMAGE_HEIGHT } from '../types'
import { generateNodeId, generateBulletNodeId } from '../utils/id-generator'
import { extractMedia, extractBulletMedia } from './markdown-media-extractor'
import type { ExtractedImage, ExtractedLink } from './markdown-media-extractor'

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
    let inCodeBlock = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // コードフェンス (``` or ~~~) の開始/終了を追跡
      if (/^(`{3,}|~{3,})/.test(line)) {
        inCodeBlock = !inCodeBlock
        if (currentSection) {
          currentSection.content += (currentSection.content ? '\n' : '') + line
        }
        continue
      }

      // コードブロック内の行はセクションコンテンツとして扱う
      if (inCodeBlock) {
        if (currentSection) {
          currentSection.content += (currentSection.content ? '\n' : '') + line
        }
        continue
      }

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

      const parsed = this.parseSectionContent(section.content)

      const node: MutableNode = {
        id: generateNodeId(section.heading, section.level),
        topic: section.heading,
        expanded: true,
        children: parsed.childNodes,
        notes: parsed.paragraphText || undefined,
        depth,
        hyperLink: parsed.hyperLink,
        image: parsed.image,
        linkMeta: parsed.linkMeta,
        imageMeta: parsed.imageMeta,
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
   * セクション本文を解析し、画像・リンク・箇条書き・段落テキストに分離する。
   */
  private parseSectionContent(content: string): {
    childNodes: MutableNode[]
    paragraphText: string
    hyperLink?: string
    image?: NodeImage
    linkMeta?: LinkMeta
    imageMeta?: ImageMeta
  } {
    if (!content) {
      return { childNodes: [], paragraphText: '' }
    }

    const media = extractMedia(content)

    // セクションノード自体に設定するメディア (最初の1つ)
    let sectionImage: NodeImage | undefined
    let sectionImageMeta: ImageMeta | undefined
    let sectionHyperLink: string | undefined
    let sectionLinkMeta: LinkMeta | undefined

    // 画像/リンクから生成する追加子ノード (2番目以降)
    const mediaChildNodes: MutableNode[] = []

    // 最初の画像をセクションノードに設定
    if (media.images.length > 0) {
      const first = media.images[0]
      sectionImage = this.toNodeImage(first)
      sectionImageMeta = { type: first.type, rawPath: first.url, alt: first.alt || undefined }
    }

    // 2番目以降の画像を子ノードとして生成
    for (let i = 1; i < media.images.length; i++) {
      mediaChildNodes.push(this.createImageNode(media.images[i]))
    }

    // 最初のリンクをセクションノードに設定
    if (media.links.length > 0) {
      const first = media.links[0]
      sectionHyperLink = first.url
      sectionLinkMeta = {
        type: first.type,
        rawTarget: first.rawTarget,
        displayText: first.displayText,
      }
    }

    // 2番目以降のリンクを子ノードとして生成
    for (let i = 1; i < media.links.length; i++) {
      mediaChildNodes.push(this.createLinkNode(media.links[i]))
    }

    // 箇条書きをパース (メディア検出込み)
    const bulletNodes = this.parseBulletLines(media.bulletLines)

    // 段落テキスト
    const paragraphText = media.paragraphLines.join('\n').trim()

    return {
      childNodes: [...mediaChildNodes, ...bulletNodes],
      paragraphText,
      hyperLink: sectionHyperLink,
      image: sectionImage,
      linkMeta: sectionLinkMeta,
      imageMeta: sectionImageMeta,
    }
  }

  /**
   * 箇条書き行をパースしてノードツリーに変換する (メディア検出込み)
   */
  private parseBulletLines(bulletLines: readonly string[]): MutableNode[] {
    const bulletNodes: MutableNode[] = []
    const bulletStack: Array<{ node: MutableNode; indent: number }> = []

    for (const line of bulletLines) {
      const bulletMatch = line.match(/^(\s*)(?:[-*]|\d+\.)\s+(.+)$/)
      if (!bulletMatch) continue

      const indent = bulletMatch[1].length
      const rawText = bulletMatch[2].trim()

      const mediaResult = extractBulletMedia(rawText)

      const bulletNode: MutableNode = {
        id: generateBulletNodeId(),
        topic: mediaResult.text,
        expanded: true,
        children: [],
        depth: 999,
        ...(mediaResult.image ? {
          image: this.toNodeImage(mediaResult.image),
          imageMeta: {
            type: mediaResult.image.type,
            rawPath: mediaResult.image.url,
            alt: mediaResult.image.alt || undefined,
          },
        } : {}),
        ...(mediaResult.link ? {
          hyperLink: mediaResult.link.url,
          linkMeta: {
            type: mediaResult.link.type,
            rawTarget: mediaResult.link.rawTarget,
            displayText: mediaResult.link.displayText,
          },
        } : {}),
      }

      while (bulletStack.length > 0 && bulletStack[bulletStack.length - 1].indent >= indent) {
        bulletStack.pop()
      }

      if (bulletStack.length > 0) {
        bulletStack[bulletStack.length - 1].node.children.push(bulletNode)
      } else {
        bulletNodes.push(bulletNode)
      }

      bulletStack.push({ node: bulletNode, indent })
    }

    return bulletNodes
  }

  private toNodeImage(img: ExtractedImage): NodeImage {
    return {
      url: img.url,
      width: DEFAULT_NODE_IMAGE_WIDTH,
      height: DEFAULT_NODE_IMAGE_HEIGHT,
      fit: 'contain',
    }
  }

  private createImageNode(img: ExtractedImage): MutableNode {
    return {
      id: generateBulletNodeId(),
      topic: img.alt || img.url,
      expanded: true,
      children: [],
      depth: 999,
      image: this.toNodeImage(img),
      imageMeta: { type: img.type, rawPath: img.url, alt: img.alt || undefined },
    }
  }

  private createLinkNode(link: ExtractedLink): MutableNode {
    return {
      id: generateBulletNodeId(),
      topic: link.text,
      expanded: true,
      children: [],
      depth: 999,
      hyperLink: link.url,
      linkMeta: {
        type: link.type,
        rawTarget: link.rawTarget,
        displayText: link.displayText,
      },
    }
  }

  private toImmutable(node: MutableNode): MindElixirNodeData {
    const result: MindElixirNodeData = {
      id: node.id,
      topic: node.topic,
      expanded: node.expanded,
      children: node.children.map((child) => this.toImmutable(child)),
      ...(node.notes ? { notes: node.notes } : {}),
      ...(node.hyperLink ? { hyperLink: node.hyperLink } : {}),
      ...(node.image ? { image: node.image } : {}),
      ...(node.linkMeta ? { linkMeta: node.linkMeta } : {}),
      ...(node.imageMeta ? { imageMeta: node.imageMeta } : {}),
    }
    return result
  }
}

interface MutableNode {
  id: string
  topic: string
  expanded: boolean
  children: MutableNode[]
  notes?: string
  depth: number
  hyperLink?: string
  image?: NodeImage
  linkMeta?: LinkMeta
  imageMeta?: ImageMeta
}
