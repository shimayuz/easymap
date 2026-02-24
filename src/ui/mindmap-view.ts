import { ItemView, WorkspaceLeaf, TFile, Notice, Menu } from 'obsidian'
import type { MindElixirData, MindElixirNodeData, EasyMindSettings } from '../types'
import { VIEW_TYPE_MINDMAP, DEFAULT_NODE_IMAGE_WIDTH, DEFAULT_NODE_IMAGE_HEIGHT } from '../types'
import { MarkdownParser } from '../core/markdown-parser'
import { SyncEngine } from '../core/sync-engine'
import { MindmapToolbar } from './mindmap-toolbar'
import { resolveNodeImages } from '../utils/vault-resource-resolver'
import { MediaInputModal } from './media-input-modal'
import type { MediaResult } from './media-input-modal'

interface MindElixirInstance {
  init(data: MindElixirData): void
  refresh(data?: MindElixirData): void
  getData(): MindElixirData
  destroy(): void
  toCenter(): void
  scale(factor: number): void
  addChild(el?: unknown, node?: unknown): Promise<void>
  bus: {
    addListener(event: string, callback: (...args: unknown[]) => void): void
  }
  nodeData: MindElixirNodeData
  currentNode: MindElixirNodeData | null
  container: HTMLElement
  map: HTMLElement
  root: HTMLElement
}

interface MindElixirConstructor {
  new (options: Record<string, unknown>): MindElixirInstance
  LEFT: number
  RIGHT: number
  SIDE: number
}

export class MindmapView extends ItemView {
  private mindElixir: MindElixirInstance | null = null
  private syncEngine: SyncEngine | null = null
  private toolbar: MindmapToolbar | null = null
  private currentFile: TFile | null = null
  private readonly parser: MarkdownParser
  private readonly settings: EasyMindSettings
  private readonly getSettings: () => EasyMindSettings
  private readonly onAIGenerate: (file: TFile) => void
  private readonly onAIExpand: (file: TFile, node: MindElixirNodeData) => void
  private readonly onExcalidrawExport: (file: TFile, data: MindElixirData) => void
  private mindmapContainer: HTMLElement | null = null

  constructor(
    leaf: WorkspaceLeaf,
    settings: EasyMindSettings,
    getSettings: () => EasyMindSettings,
    onAIGenerate: (file: TFile) => void,
    onAIExpand: (file: TFile, node: MindElixirNodeData) => void,
    onExcalidrawExport: (file: TFile, data: MindElixirData) => void
  ) {
    super(leaf)
    this.settings = settings
    this.getSettings = getSettings
    this.parser = new MarkdownParser()
    this.onAIGenerate = onAIGenerate
    this.onAIExpand = onAIExpand
    this.onExcalidrawExport = onExcalidrawExport
  }

  getViewType(): string {
    return VIEW_TYPE_MINDMAP
  }

  getDisplayText(): string {
    return this.currentFile
      ? `Mind Map: ${this.currentFile.basename}`
      : 'Mind Map'
  }

  getIcon(): string {
    return 'brain'
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement
    container.empty()
    container.addClass('easymind-view-container')

    this.toolbar = new MindmapToolbar(container, {
      onZoomIn: () => this.mindElixir?.scale(1.2),
      onZoomOut: () => this.mindElixir?.scale(0.8),
      onFitView: () => this.mindElixir?.toCenter(),
      onAIGenerate: () => {
        if (this.currentFile) {
          this.onAIGenerate(this.currentFile)
        }
      },
      onAIExpand: () => {
        if (this.currentFile && this.mindElixir?.currentNode) {
          this.onAIExpand(this.currentFile, this.mindElixir.currentNode)
        }
      },
      onExport: () => {
        if (this.currentFile && this.mindElixir) {
          this.onExcalidrawExport(this.currentFile, this.mindElixir.getData())
        }
      },
    })

    this.mindmapContainer = container.createDiv({ cls: 'easymind-mindmap-container' })

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.handleActiveLeafChange()
      })
    )

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file === this.currentFile) {
          this.handleFileModified(file)
        }
      })
    )

    this.handleActiveLeafChange()
  }

  async onClose(): Promise<void> {
    this.syncEngine?.destroy()
    this.mindElixir?.destroy()
    this.mindElixir = null
    this.syncEngine = null
  }

  private handleActiveLeafChange(): void {
    const file = this.app.workspace.getActiveFile()
    if (!file || file.extension !== 'md') return
    if (file === this.currentFile) return

    this.currentFile = file
    this.loadFile(file)
  }

  private async loadFile(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file)
      const data = this.parser.toMindElixirData(content, file.basename)

      // Vault画像URLを解決
      const resolvedData: MindElixirData = {
        nodeData: resolveNodeImages(data.nodeData, this.app, file),
      }

      this.syncEngine?.destroy()
      const currentSettings = this.getSettings()
      this.syncEngine = new SyncEngine(this.app.vault, currentSettings)

      await this.initMindElixir(resolvedData)

      // Trigger header update by toggling pin state
      const header = (this.leaf as unknown as Record<string, unknown>)
      if (typeof header.updateHeader === 'function') {
        (header.updateHeader as () => void)()
      }
    } catch (error) {
      new Notice(
        `Failed to load mind map: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private async initMindElixir(data: MindElixirData): Promise<void> {
    if (!this.mindmapContainer) return

    if (this.mindElixir) {
      this.mindElixir.destroy()
      this.mindElixir = null
    }

    this.mindmapContainer.empty()

    const MindElixir = await this.loadMindElixirLibrary()
    if (!MindElixir) return

    const currentSettings = this.getSettings()
    const directionMap: Record<string, number> = {
      left: MindElixir.LEFT,
      right: MindElixir.RIGHT,
      side: MindElixir.SIDE,
    }
    const direction = directionMap[currentSettings.direction] ?? MindElixir.RIGHT

    this.mindElixir = new MindElixir({
      el: this.mindmapContainer,
      direction,
      draggable: true,
      editable: true,
      contextMenu: true,
      contextMenuOption: {
        focus: true,
        extend: [
          {
            name: '画像を追加',
            onclick: () => this.openMediaModal('image'),
          },
          {
            name: 'リンクを追加',
            onclick: () => this.openMediaModal('link'),
          },
        ],
      },
      toolBar: false,
      nodeMenu: true,
      keypress: true,
      allowUndo: true,
      locale: currentSettings.language,
      overflowHidden: false,
      primaryLinkStyle: 2,
      primaryNodeHorizontalGap: currentSettings.nodeHorizontalGap,
      primaryNodeVerticalGap: currentSettings.nodeVerticalGap,
    })

    // フォントサイズをCSS custom propertyで適用
    this.mindmapContainer.style.setProperty(
      '--easymind-font-size',
      `${currentSettings.fontSize}px`
    )

    this.mindElixir.init(data)

    this.mindElixir.bus.addListener('operation', () => {
      if (!this.currentFile || !this.mindElixir || !this.syncEngine) return
      const currentData = this.mindElixir.getData()
      this.syncEngine.onMindmapChanged(this.currentFile, currentData)
    })

    // ダブルクリックでフリーノード作成
    if (currentSettings.dblclickFreeNode) {
      this.registerDblclickFreeNode()
    }
  }

  private openMediaModal(type: 'image' | 'link'): void {
    if (!this.mindElixir?.currentNode) {
      new Notice('ノードを選択してください')
      return
    }

    new MediaInputModal(this.app, (result) => {
      this.applyMediaToCurrentNode(result)
    }, type).open()
  }

  private applyMediaToCurrentNode(result: MediaResult): void {
    if (!this.mindElixir?.currentNode) return

    // Mind Elixir requires direct mutation of its internal node objects for
    // live updates. This is an intentional exception to the immutability rule.
    const node = this.mindElixir.currentNode as unknown as Record<string, unknown>

    if (result.type === 'image') {
      node.image = {
        url: result.url,
        width: DEFAULT_NODE_IMAGE_WIDTH,
        height: DEFAULT_NODE_IMAGE_HEIGHT,
        fit: 'contain',
      }
      node.imageMeta = {
        type: result.isVaultResource ? 'vault' : 'external',
        rawPath: result.rawPath,
        alt: result.displayText || '',
      }
    } else {
      node.hyperLink = result.url
      node.linkMeta = result.isVaultResource
        ? {
            type: 'wiki' as const,
            rawTarget: result.rawPath,
            displayText: result.displayText,
          }
        : {
            type: 'external' as const,
            rawTarget: result.url,
          }
    }

    // Mind Elixir のUIを更新
    this.mindElixir?.refresh()

    // 変更を sync-engine に伝播
    if (this.currentFile && this.mindElixir && this.syncEngine) {
      const currentData = this.mindElixir.getData()
      this.syncEngine.onMindmapChanged(this.currentFile, currentData)
    }
  }

  private registerDblclickFreeNode(): void {
    if (!this.mindElixir || !this.mindmapContainer) return

    const handler = (e: MouseEvent) => {
      if (!this.mindElixir) return

      // クリック対象がノード要素でないことを確認 (空白エリアのみ)
      const target = e.target as HTMLElement
      if (target.closest('me-tpc') || target.closest('t') || target.closest('me-parent')) {
        return
      }

      // rootノードのDOM要素を取得してaddChildを呼ぶ
      const rootTpc = this.mindmapContainer?.querySelector('me-root me-tpc') as HTMLElement | null
      if (!rootTpc) return

      this.mindElixir.addChild(rootTpc)
    }

    this.mindmapContainer.addEventListener('dblclick', handler)
    this.register(() => {
      this.mindmapContainer?.removeEventListener('dblclick', handler)
    })
  }

  private async loadMindElixirLibrary(): Promise<MindElixirConstructor | null> {
    try {
      const module = await import('mind-elixir')
      return (module.default || module) as unknown as MindElixirConstructor
    } catch (error) {
      new Notice('Failed to load Mind Elixir library')
      return null
    }
  }

  private async handleFileModified(file: TFile): Promise<void> {
    if (!this.syncEngine || !this.mindElixir) return

    const currentSettings = this.getSettings()
    if (!currentSettings.autoSync) return

    try {
      const content = await this.app.vault.read(file)
      await this.syncEngine.onMarkdownChanged(
        file,
        content,
        (data: MindElixirData) => {
          // Vault画像URLを解決してからリフレッシュ
          const resolvedData: MindElixirData = {
            nodeData: resolveNodeImages(data.nodeData, this.app, file),
          }
          this.mindElixir?.refresh(resolvedData)
        }
      )
    } catch (error) {
      // Silently ignore sync errors to avoid spamming user
    }
  }

  getState(): Record<string, unknown> {
    return {
      file: this.currentFile?.path ?? null,
    }
  }

  async setState(
    state: unknown,
    _result: unknown
  ): Promise<void> {
    if (!state || typeof state !== 'object') return
    const stateRecord = state as Record<string, unknown>
    const filePath = stateRecord.file as string | null
    if (filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath)
      if (file instanceof TFile) {
        this.currentFile = file
        await this.loadFile(file)
      }
    }
  }
}
