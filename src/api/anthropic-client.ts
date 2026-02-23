import { requestUrl } from 'obsidian'
import type { MindElixirNodeData, EasyMindSettings } from '../types'
import { BULLET_ID_PREFIX } from '../core/markdown-parser'
import { generateRandomId } from '../utils/id-generator'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

interface AnthropicMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

interface AnthropicResponse {
  readonly content: ReadonlyArray<{ readonly type: string; readonly text: string }>
}

export class AnthropicClient {
  private readonly settings: EasyMindSettings

  constructor(settings: EasyMindSettings) {
    this.settings = settings
  }

  async generateMindMap(
    noteContent: string,
    fileName: string
  ): Promise<MindElixirNodeData> {
    const language = this.settings.language === 'ja' ? 'Japanese' : 'English'
    const maxDepth = this.settings.maxDepth

    const systemPrompt = `You are an expert at analyzing text and creating structured mind maps.
Analyze the provided note content and generate a hierarchical mind map structure.
Output ONLY valid JSON with no additional text.

JSON format:
{
  "topic": "Main Theme",
  "id": "root",
  "expanded": true,
  "children": [
    {
      "topic": "Subtopic 1",
      "id": "unique_id_1",
      "expanded": true,
      "children": []
    }
  ]
}

Constraints:
- topic must be a string (max 50 characters)
- children must be an array
- Maximum depth: ${maxDepth} levels
- Generate 3-7 main branches
- Each branch should have 2-5 sub-items
- Output in ${language}
- id must be unique strings`

    const userPrompt = `Analyze the following note titled "${fileName}" and create a comprehensive mind map:

---
${noteContent.substring(0, 8000)}
---`

    const result = await this.callApi(systemPrompt, userPrompt)
    return this.parseNodeData(result)
  }

  async expandNode(
    topic: string,
    context: string
  ): Promise<ReadonlyArray<MindElixirNodeData>> {
    const language = this.settings.language === 'ja' ? 'Japanese' : 'English'

    const systemPrompt = `You are an expert at expanding mind map topics.
Generate subtopics for the given topic. Output ONLY valid JSON with no additional text.

JSON format:
{
  "children": [
    {
      "topic": "Subtopic 1",
      "id": "unique_id_1",
      "expanded": true,
      "children": []
    }
  ]
}

Constraints:
- Generate 3-5 subtopics
- Each topic max 50 characters
- Include children arrays (can be empty)
- Maximum 2 additional levels deep
- Output in ${language}
- id must be unique strings`

    const userPrompt = `Expand the topic "${topic}" with relevant subtopics.
${context ? `Context from the note: ${context.substring(0, 2000)}` : ''}`

    const result = await this.callApi(systemPrompt, userPrompt)
    return this.parseExpansion(result)
  }

  async summarizeBodyText(
    paragraphText: string,
    headingContext: string
  ): Promise<ReadonlyArray<MindElixirNodeData>> {
    const language = this.settings.language === 'ja' ? 'Japanese' : 'English'

    const systemPrompt = `You are an expert at summarizing text into concise bullet points for mind maps.
Given paragraph text from a document section, extract the key points as a flat list.
Output ONLY valid JSON with no additional text.

JSON format:
{
  "items": [
    "Key point 1",
    "Key point 2"
  ]
}

Constraints:
- Extract 2-5 key points
- Each point max 60 characters
- Keep the original meaning
- Output in ${language}
- Do not include the heading itself as a point`

    const userPrompt = `Summarize the following text under the heading "${headingContext}" into key bullet points:

---
${paragraphText.substring(0, 4000)}
---`

    const result = await this.callApi(systemPrompt, userPrompt)
    return this.parseSummaryItems(result)
  }

  private parseSummaryItems(text: string): ReadonlyArray<MindElixirNodeData> {
    const json = this.extractJson(text)
    if (!json) {
      throw new Error('Failed to extract valid JSON from AI response')
    }

    const data = JSON.parse(json)
    const items: string[] = Array.isArray(data.items) ? data.items : []

    return items
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => ({
        id: BULLET_ID_PREFIX + generateRandomId().substring(3),
        topic: item.trim(),
        expanded: true,
        children: [] as readonly MindElixirNodeData[],
      }))
  }

  private async callApi(
    systemPrompt: string,
    userPrompt: string,
    maxRetries = 3
  ): Promise<string> {
    if (!this.settings.anthropicApiKey) {
      throw new Error('Anthropic API key is not configured')
    }

    const messages: AnthropicMessage[] = [
      { role: 'user', content: userPrompt },
    ]

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await requestUrl({
          url: ANTHROPIC_API_URL,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.settings.anthropicApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.settings.model,
            max_tokens: 4096,
            system: systemPrompt,
            messages,
          }),
        })

        const data = response.json as AnthropicResponse
        const text = data.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('')

        return text
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw new Error(
            `API request failed after ${maxRetries} attempts: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          )
        }
        await this.sleep(Math.pow(2, attempt) * 1000)
      }
    }

    throw new Error('API request failed')
  }

  private parseNodeData(text: string): MindElixirNodeData {
    const json = this.extractJson(text)
    if (!json) {
      throw new Error('Failed to extract valid JSON from AI response')
    }

    const data = JSON.parse(json)
    return this.validateNodeData(data)
  }

  private parseExpansion(text: string): ReadonlyArray<MindElixirNodeData> {
    const json = this.extractJson(text)
    if (!json) {
      throw new Error('Failed to extract valid JSON from AI response')
    }

    const data = JSON.parse(json)
    if (!data.children || !Array.isArray(data.children)) {
      throw new Error('Invalid expansion response: missing children array')
    }

    return data.children.map((child: Record<string, unknown>) =>
      this.validateNodeData(child)
    )
  }

  private extractJson(text: string): string | null {
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim()
    }

    const startIdx = text.indexOf('{')
    const endIdx = text.lastIndexOf('}')
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const candidate = text.substring(startIdx, endIdx + 1)
      try {
        JSON.parse(candidate)
        return candidate
      } catch {
        return null
      }
    }

    return null
  }

  private validateNodeData(data: Record<string, unknown>): MindElixirNodeData {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid node data')
    }

    const topic = typeof data.topic === 'string' ? data.topic : 'Untitled'
    const id =
      typeof data.id === 'string'
        ? data.id
        : 'node_' + Math.random().toString(36).substring(2, 11)

    const children = Array.isArray(data.children)
      ? data.children.map((child: Record<string, unknown>) =>
          this.validateNodeData(child)
        )
      : []

    return {
      id,
      topic,
      expanded: true,
      children,
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
