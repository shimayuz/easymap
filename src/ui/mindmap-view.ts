import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian'
import type { MindElixirData, MindElixirNodeData, EasyMindSettings } from '../types'
import { VIEW_TYPE_MINDMAP } from '../types'
import { MarkdownParser } from '../core/markdown-parser'
import { SyncEngine } from '../core/sync-engine'
import { MindmapToolbar } from './mindmap-toolbar'

interface MindElixirInstance {
  init(data: MindElixirData): void
  refresh(data?: MindElixirData): void
  getData(): MindElixirData
  destroy(): void
  toCenter(): void
  scale(factor: number): void
  bus: {
    addListener(event: string, callback: (...args: unknown[]) => void): void
  }
  nodeData: MindElixirNodeData
  currentNode: MindElixirNodeData | null
  container: HTMLElement
}

interface MindElixirConstructor {
  new (options: Record<string, unknown>): MindElixirInstance
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

      this.syncEngine?.destroy()
      const currentSettings = this.getSettings()
      this.syncEngine = new SyncEngine(this.app.vault, currentSettings)

      await this.initMindElixir(data)

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
    const direction = currentSettings.direction === 'side'
      ? MindElixir.SIDE
      : MindElixir.RIGHT

    this.mindElixir = new MindElixir({
      el: this.mindmapContainer,
      direction,
      draggable: true,
      editable: true,
      contextMenu: true,
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

    this.mindElixir.init(data)

    this.mindElixir.bus.addListener('operation', () => {
      if (!this.currentFile || !this.mindElixir || !this.syncEngine) return
      const currentData = this.mindElixir.getData()
      this.syncEngine.onMindmapChanged(this.currentFile, currentData)
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
          this.mindElixir?.refresh(data)
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
