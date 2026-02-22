import type { TFile, Vault } from 'obsidian'
import type { MindElixirData, EasyMindSettings } from '../types'
import { MarkdownParser } from './markdown-parser'
import { MarkdownWriter } from './markdown-writer'
import { debounce } from '../utils/debounce'

export class SyncEngine {
  private locked = false
  private lastContentHash = ''
  private readonly parser: MarkdownParser
  private readonly writer: MarkdownWriter
  private readonly debouncedMindmapToMarkdown: (() => void) & { cancel: () => void }
  private pendingFile: TFile | null = null
  private pendingData: MindElixirData | null = null
  private readonly vault: Vault

  constructor(vault: Vault, settings: EasyMindSettings) {
    this.vault = vault
    this.parser = new MarkdownParser()
    this.writer = new MarkdownWriter()
    this.debouncedMindmapToMarkdown = debounce(
      () => this.executeMindmapToMarkdown(),
      settings.debounceDelay
    )
  }

  async onMarkdownChanged(
    file: TFile,
    content: string,
    refreshMindmap: (data: MindElixirData) => void
  ): Promise<void> {
    if (this.locked) return

    const hash = this.computeHash(content)
    if (hash === this.lastContentHash) return

    this.lastContentHash = hash

    try {
      this.locked = true
      const data = this.parser.toMindElixirData(content, file.basename)
      refreshMindmap(data)
    } finally {
      this.locked = false
    }
  }

  onMindmapChanged(file: TFile, data: MindElixirData): void {
    if (this.locked) return

    this.pendingFile = file
    this.pendingData = data
    this.debouncedMindmapToMarkdown()
  }

  private async executeMindmapToMarkdown(): Promise<void> {
    if (!this.pendingFile || !this.pendingData) return
    if (this.locked) return

    const file = this.pendingFile
    const data = this.pendingData
    this.pendingFile = null
    this.pendingData = null

    try {
      this.locked = true

      const currentContent = await this.vault.read(file)
      const parsed = this.parser.parse(currentContent)
      const newContent = this.writer.toMarkdown(data.nodeData, parsed.frontmatter)
      const newHash = this.computeHash(newContent)

      if (newHash === this.lastContentHash) return

      this.lastContentHash = newHash
      await this.vault.modify(file, newContent)
    } catch (error) {
      throw new Error(
        `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    } finally {
      this.locked = false
    }
  }

  private computeHash(content: string): string {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash + char) | 0
    }
    return hash.toString(36)
  }

  destroy(): void {
    this.debouncedMindmapToMarkdown.cancel()
  }
}
