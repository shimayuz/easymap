export interface MindElixirNodeData {
  readonly id: string
  readonly topic: string
  readonly children?: readonly MindElixirNodeData[]
  readonly expanded?: boolean
  readonly direction?: number
  readonly style?: Readonly<Record<string, string>>
  readonly notes?: string
}

export interface MindElixirData {
  readonly nodeData: MindElixirNodeData
}

export interface EasyMindSettings {
  readonly anthropicApiKey: string
  readonly model: string
  readonly maxDepth: number
  readonly language: 'ja' | 'en'
  readonly autoSync: boolean
  readonly debounceDelay: number
  readonly theme: 'auto' | 'light' | 'dark'
  readonly nodeHorizontalGap: number
  readonly nodeVerticalGap: number
  readonly direction: 'right' | 'side'
}

export const DEFAULT_SETTINGS: EasyMindSettings = {
  anthropicApiKey: '',
  model: 'claude-haiku-4-5-20251001',
  maxDepth: 4,
  language: 'ja',
  autoSync: true,
  debounceDelay: 500,
  theme: 'auto',
  nodeHorizontalGap: 65,
  nodeVerticalGap: 25,
  direction: 'right',
}

export interface SyncState {
  readonly locked: boolean
  readonly lastContentHash: string
  readonly pendingUpdate: boolean
}

export interface MarkdownSection {
  readonly heading: string
  readonly level: number
  readonly content: string
  readonly lineStart: number
  readonly lineEnd: number
}

export interface ParsedMarkdown {
  readonly frontmatter: string | null
  readonly sections: readonly MarkdownSection[]
  readonly rawContent: string
}

export interface LLMProgress {
  readonly phase: 'generating' | 'parsing' | 'done' | 'error'
  readonly message: string
}

export const VIEW_TYPE_MINDMAP = 'mindmap-elixir-view'
