import type { Vault, TFile } from 'obsidian'
import type { MindElixirData, MindElixirNodeData } from '../types'

interface ExcalidrawElement {
  readonly id: string
  readonly type: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly angle: number
  readonly strokeColor: string
  readonly backgroundColor: string
  readonly fillStyle: string
  readonly strokeWidth: number
  readonly strokeStyle: string
  readonly roughness: number
  readonly opacity: number
  readonly groupIds: readonly string[]
  readonly roundness: { readonly type: number } | null
  readonly seed: number
  readonly version: number
  readonly versionNonce: number
  readonly isDeleted: boolean
  readonly boundElements: ReadonlyArray<{ readonly id: string; readonly type: string }> | null
  readonly updated: number
  readonly link: string | null
  readonly locked: boolean
  readonly text?: string
  readonly fontSize?: number
  readonly fontFamily?: number
  readonly textAlign?: string
  readonly verticalAlign?: string
  readonly containerId?: string | null
  readonly originalText?: string
  readonly points?: ReadonlyArray<readonly [number, number]>
  readonly startBinding?: { readonly elementId: string; readonly focus: number; readonly gap: number } | null
  readonly endBinding?: { readonly elementId: string; readonly focus: number; readonly gap: number } | null
  readonly startArrowhead?: string | null
  readonly endArrowhead?: string | null
}

interface LayoutNode {
  readonly id: string
  readonly topic: string
  readonly children: readonly LayoutNode[]
  x: number
  y: number
  width: number
  height: number
  subtreeHeight: number
}

const NODE_PADDING_X = 24
const NODE_PADDING_Y = 12
const CHAR_WIDTH = 8
const LINE_HEIGHT = 20
const H_SPACING = 200
const V_SPACING = 30
const ROOT_FONT_SIZE = 20
const BRANCH_FONT_SIZE = 16
const LEAF_FONT_SIZE = 14

const COLORS = [
  '#1e1e1e',
  '#e03131',
  '#2f9e44',
  '#1971c2',
  '#f08c00',
  '#6741d9',
  '#0c8599',
  '#e8590c',
]

export class ExcalidrawExporter {
  private seed = 1

  async export(
    data: MindElixirData,
    sourceFile: TFile,
    vault: Vault
  ): Promise<string> {
    const elements: ExcalidrawElement[] = []
    const layoutTree = this.buildLayoutTree(data.nodeData, 0)
    this.computeLayout(layoutTree, 0, 0)
    this.generateElements(layoutTree, elements, null, 0)

    const excalidrawData = {
      type: 'excalidraw',
      version: 2,
      source: 'easymind-obsidian-plugin',
      elements,
      appState: {
        viewBackgroundColor: '#ffffff',
        gridSize: null,
      },
      files: {},
    }

    const fileName = sourceFile.basename + '.excalidraw'
    const folderPath = sourceFile.parent?.path || ''
    const filePath = folderPath ? `${folderPath}/${fileName}` : fileName

    const content = JSON.stringify(excalidrawData, null, 2)
    const existingFile = vault.getAbstractFileByPath(filePath)

    if (existingFile instanceof Object && 'path' in existingFile) {
      await vault.modify(existingFile as TFile, content)
    } else {
      await vault.create(filePath, content)
    }

    return filePath
  }

  private buildLayoutTree(
    node: MindElixirNodeData,
    depth: number
  ): LayoutNode {
    const textWidth = node.topic.length * CHAR_WIDTH + NODE_PADDING_X * 2
    const width = Math.max(80, Math.min(textWidth, 300))
    const height = LINE_HEIGHT + NODE_PADDING_Y * 2

    return {
      id: node.id,
      topic: node.topic,
      children: (node.children || []).map((child) =>
        this.buildLayoutTree(child, depth + 1)
      ),
      x: 0,
      y: 0,
      width,
      height,
      subtreeHeight: 0,
    }
  }

  private computeLayout(node: LayoutNode, x: number, y: number): void {
    node.x = x
    node.y = y

    if (node.children.length === 0) {
      node.subtreeHeight = node.height
      return
    }

    let totalChildHeight = 0
    for (const child of node.children) {
      this.computeLayout(child, 0, 0)
      totalChildHeight += child.subtreeHeight
    }
    totalChildHeight += (node.children.length - 1) * V_SPACING

    node.subtreeHeight = Math.max(node.height, totalChildHeight)

    const childX = x + node.width + H_SPACING
    let childY = y + node.height / 2 - totalChildHeight / 2

    for (const child of node.children) {
      const childCenterOffset = child.subtreeHeight / 2 - child.height / 2
      child.x = childX
      child.y = childY + childCenterOffset
      this.computeLayout(child, child.x, child.y)
      childY += child.subtreeHeight + V_SPACING
    }
  }

  private generateElements(
    node: LayoutNode,
    elements: ExcalidrawElement[],
    parentId: string | null,
    depth: number
  ): void {
    const colorIndex = depth % COLORS.length
    const bgColor = depth === 0 ? '#a5d8ff' : depth === 1 ? '#d0bfff' : '#fff9db'
    const fontSize =
      depth === 0
        ? ROOT_FONT_SIZE
        : depth === 1
          ? BRANCH_FONT_SIZE
          : LEAF_FONT_SIZE

    const rectId = `rect_${node.id}`
    const textId = `text_${node.id}`

    const rect: ExcalidrawElement = {
      id: rectId,
      type: 'rectangle',
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      angle: 0,
      strokeColor: COLORS[colorIndex],
      backgroundColor: bgColor,
      fillStyle: 'solid',
      strokeWidth: depth === 0 ? 2 : 1,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      roundness: { type: 3 },
      seed: this.nextSeed(),
      version: 1,
      versionNonce: this.nextSeed(),
      isDeleted: false,
      boundElements: [{ id: textId, type: 'text' }],
      updated: Date.now(),
      link: null,
      locked: false,
    }

    const textEl: ExcalidrawElement = {
      id: textId,
      type: 'text',
      x: node.x + NODE_PADDING_X,
      y: node.y + NODE_PADDING_Y,
      width: node.width - NODE_PADDING_X * 2,
      height: LINE_HEIGHT,
      angle: 0,
      strokeColor: COLORS[colorIndex],
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      roundness: null,
      seed: this.nextSeed(),
      version: 1,
      versionNonce: this.nextSeed(),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text: node.topic,
      fontSize,
      fontFamily: 1,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectId,
      originalText: node.topic,
    }

    elements.push(rect)
    elements.push(textEl)

    if (parentId) {
      const arrowId = `arrow_${parentId}_${node.id}`
      const arrow: ExcalidrawElement = {
        id: arrowId,
        type: 'arrow',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        angle: 0,
        strokeColor: '#868e96',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        roundness: { type: 2 },
        seed: this.nextSeed(),
        version: 1,
        versionNonce: this.nextSeed(),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        points: [[0, 0], [100, 0]],
        startBinding: {
          elementId: `rect_${parentId}`,
          focus: 0,
          gap: 4,
        },
        endBinding: {
          elementId: rectId,
          focus: 0,
          gap: 4,
        },
        startArrowhead: null,
        endArrowhead: 'arrow',
      }
      elements.push(arrow)
    }

    for (const child of node.children) {
      this.generateElements(child, elements, node.id, depth + 1)
    }
  }

  private nextSeed(): number {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed
  }
}
