import { Plugin, Notice, TFile } from 'obsidian'
import type { MindElixirNodeData, MindElixirData, EasyMindSettings } from './types'
import { DEFAULT_SETTINGS, VIEW_TYPE_MINDMAP } from './types'
import { MindmapView } from './ui/mindmap-view'
import { EasyMindSettingTab } from './ui/settings-tab'
import { AnthropicClient } from './api/anthropic-client'
import { ExcalidrawExporter } from './export/excalidraw-exporter'
import { LLMProgressModal } from './ui/llm-progress-modal'
import { MarkdownParser } from './core/markdown-parser'
import { MarkdownWriter } from './core/markdown-writer'

export default class EasyMindPlugin extends Plugin {
  settings!: EasyMindSettings
  private anthropicClient!: AnthropicClient
  private excalidrawExporter!: ExcalidrawExporter
  private parser!: MarkdownParser
  private writer!: MarkdownWriter

  async onload(): Promise<void> {
    await this.loadSettings()
    this.initializeServices()

    this.registerView(VIEW_TYPE_MINDMAP, (leaf) => {
      return new MindmapView(
        leaf,
        this.settings,
        () => this.settings,
        (file) => this.generateMindMapWithAI(file),
        (file, node) => this.expandNodeWithAI(file, node),
        (file, data) => this.exportToExcalidraw(file, data)
      )
    })

    this.addRibbonIcon('brain', 'Open Mind Map', () => {
      this.activateMindmapView()
    })

    this.registerCommands()
    this.addSettingTab(new EasyMindSettingTab(this.app, this))

    this.app.workspace.onLayoutReady(() => {
      this.checkGitignoreSafety()
    })
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MINDMAP)
  }

  private initializeServices(): void {
    this.anthropicClient = new AnthropicClient(this.settings)
    this.excalidrawExporter = new ExcalidrawExporter()
    this.parser = new MarkdownParser()
    this.writer = new MarkdownWriter()
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'open-mindmap',
      name: 'Open Mind Map View',
      callback: () => this.activateMindmapView(),
    })

    this.addCommand({
      id: 'generate-mindmap-ai',
      name: 'Generate Mind Map with AI',
      callback: () => {
        const file = this.app.workspace.getActiveFile()
        if (file && file.extension === 'md') {
          this.generateMindMapWithAI(file)
        } else {
          new Notice('Please open a Markdown file first')
        }
      },
    })

    this.addCommand({
      id: 'expand-node-ai',
      name: 'Expand Selected Node with AI',
      callback: () => {
        new Notice('Select a node in the mind map first, then use the toolbar button')
      },
    })

    this.addCommand({
      id: 'summarize-body-ai',
      name: 'Summarize Body Text with AI',
      callback: () => {
        const file = this.app.workspace.getActiveFile()
        if (file && file.extension === 'md') {
          this.summarizeBodyTextWithAI(file)
        } else {
          new Notice('Please open a Markdown file first')
        }
      },
    })

    this.addCommand({
      id: 'export-excalidraw',
      name: 'Export Mind Map to Excalidraw',
      callback: () => {
        const file = this.app.workspace.getActiveFile()
        if (!file || file.extension !== 'md') {
          new Notice('Please open a Markdown file first')
          return
        }
        this.exportCurrentFileToExcalidraw(file)
      },
    })
  }

  private async activateMindmapView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0])
      return
    }

    const leaf = this.app.workspace.getRightLeaf(false)
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_MINDMAP,
        active: true,
      })
      this.app.workspace.revealLeaf(leaf)
    }
  }

  private async generateMindMapWithAI(file: TFile): Promise<void> {
    if (!this.settings.anthropicApiKey) {
      new Notice('Please configure your Anthropic API key in EasyMind settings')
      return
    }

    const progressModal = new LLMProgressModal(this.app)
    progressModal.open()

    try {
      progressModal.update({
        phase: 'generating',
        message: 'Reading note content...',
      })

      const content = await this.app.vault.read(file)

      progressModal.update({
        phase: 'generating',
        message: 'Generating mind map with AI...',
      })

      const nodeData = await this.anthropicClient.generateMindMap(
        content,
        file.basename
      )

      progressModal.update({
        phase: 'parsing',
        message: 'Writing mind map structure to note...',
      })

      const parsed = this.parser.parse(content)
      const newContent = this.writer.toMarkdown(nodeData, parsed.frontmatter)
      await this.app.vault.modify(file, newContent)

      progressModal.update({
        phase: 'done',
        message: 'Mind map generated successfully!',
      })

      setTimeout(() => progressModal.close(), 2000)
    } catch (error) {
      progressModal.update({
        phase: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
      setTimeout(() => progressModal.close(), 5000)
    }
  }

  private async expandNodeWithAI(
    file: TFile,
    node: MindElixirNodeData
  ): Promise<void> {
    if (!this.settings.anthropicApiKey) {
      new Notice('Please configure your Anthropic API key in EasyMind settings')
      return
    }

    const loadingNotice = new Notice('Expanding node with AI...', 0)

    try {
      const content = await this.app.vault.read(file)
      const newChildren = await this.anthropicClient.expandNode(
        node.topic,
        content.substring(0, 2000)
      )

      new Notice(`Added ${newChildren.length} subtopics to "${node.topic}"`)
    } catch (error) {
      new Notice(
        `Failed to expand node: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    } finally {
      loadingNotice.hide()
    }
  }

  private async summarizeBodyTextWithAI(file: TFile): Promise<void> {
    if (!this.settings.anthropicApiKey) {
      new Notice('Please configure your Anthropic API key in EasyMind settings')
      return
    }

    const progressModal = new LLMProgressModal(this.app)
    progressModal.open()

    try {
      progressModal.update({
        phase: 'generating',
        message: 'Reading note content...',
      })

      const content = await this.app.vault.read(file)
      const parsed = this.parser.parse(content)
      const data = this.parser.toMindElixirData(content, file.basename)

      // notes を持つノードを収集
      const nodesWithNotes = this.collectNodesWithNotes(data.nodeData)

      if (nodesWithNotes.length === 0) {
        progressModal.update({
          phase: 'done',
          message: 'No body text found to summarize.',
        })
        setTimeout(() => progressModal.close(), 2000)
        return
      }

      progressModal.update({
        phase: 'generating',
        message: `Summarizing ${nodesWithNotes.length} section(s) with AI...`,
      })

      // 各ノードの notes を AI で要約し、bullet 子ノードとして追加
      const updatedNodeData = await this.addSummaryChildren(
        data.nodeData,
        nodesWithNotes
      )

      progressModal.update({
        phase: 'parsing',
        message: 'Writing updated structure to note...',
      })

      const newContent = this.writer.toMarkdown(updatedNodeData, parsed.frontmatter)
      await this.app.vault.modify(file, newContent)

      progressModal.update({
        phase: 'done',
        message: `Summarized ${nodesWithNotes.length} section(s) successfully!`,
      })

      setTimeout(() => progressModal.close(), 2000)
    } catch (error) {
      progressModal.update({
        phase: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
      setTimeout(() => progressModal.close(), 5000)
    }
  }

  private collectNodesWithNotes(
    node: MindElixirNodeData
  ): ReadonlyArray<{ readonly id: string; readonly topic: string; readonly notes: string }> {
    const results: Array<{ readonly id: string; readonly topic: string; readonly notes: string }> = []

    if (node.notes && node.notes.trim().length > 0 && node.id !== 'root') {
      results.push({ id: node.id, topic: node.topic, notes: node.notes })
    }

    if (node.children) {
      for (const child of node.children) {
        results.push(...this.collectNodesWithNotes(child))
      }
    }

    return results
  }

  private async addSummaryChildren(
    node: MindElixirNodeData,
    nodesWithNotes: ReadonlyArray<{ readonly id: string; readonly topic: string; readonly notes: string }>
  ): Promise<MindElixirNodeData> {
    const noteIds = new Set(nodesWithNotes.map((n) => n.id))

    const processNode = async (
      current: MindElixirNodeData
    ): Promise<MindElixirNodeData> => {
      const processedChildren: MindElixirNodeData[] = []
      if (current.children) {
        for (const child of current.children) {
          processedChildren.push(await processNode(child))
        }
      }

      if (noteIds.has(current.id) && current.notes) {
        const summaryNodes = await this.anthropicClient.summarizeBodyText(
          current.notes,
          current.topic
        )
        return {
          ...current,
          children: [...processedChildren, ...summaryNodes],
        }
      }

      return {
        ...current,
        children: processedChildren,
      }
    }

    return processNode(node)
  }

  private async exportToExcalidraw(
    file: TFile,
    data: MindElixirData
  ): Promise<void> {
    try {
      const filePath = await this.excalidrawExporter.export(
        data,
        file,
        this.app.vault
      )
      new Notice(`Exported to ${filePath}`)
    } catch (error) {
      new Notice(
        `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private async exportCurrentFileToExcalidraw(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file)
      const data = this.parser.toMindElixirData(content, file.basename)
      await this.exportToExcalidraw(file, data)
    } catch (error) {
      new Notice(
        `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private async checkGitignoreSafety(): Promise<void> {
    if (!this.settings.anthropicApiKey) return

    try {
      const gitignorePath = '.gitignore'
      const adapter = this.app.vault.adapter
      const exists = await adapter.exists(gitignorePath)
      if (!exists) return

      const content = await adapter.read(gitignorePath)
      const lines = content.split('\n').map((l) => l.trim())

      const pluginDataProtected = lines.some((line) =>
        line === 'data.json' ||
        line === '.obsidian/' ||
        line === '.obsidian/**' ||
        line === '.obsidian/plugins/' ||
        line === '.obsidian/plugins/**' ||
        line === '.obsidian/plugins/easymind/data.json'
      )

      if (!pluginDataProtected) {
        new Notice(
          '[EasyMind] Warning: Your API key may be exposed via Git. ' +
          'Add "data.json" to your .gitignore file.',
          15000
        )
      }
    } catch {
      // Vault adapter errors are non-critical; skip silently
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
    this.initializeServices()
  }
}
