import { App, Modal } from 'obsidian'
import type { LLMProgress } from '../types'

const ANIMATION_FRAMES = [
  'Thinking',
  'Thinking.',
  'Thinking..',
  'Thinking...',
]

export class LLMProgressModal extends Modal {
  private messageEl: HTMLElement | null = null
  private animationEl: HTMLElement | null = null
  private animationInterval: number | null = null
  private frameIndex = 0

  constructor(app: App) {
    super(app)
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.addClass('easymind-progress-modal')

    this.animationEl = contentEl.createEl('div', { cls: 'easymind-progress-animation' })
    this.animationEl.setText(ANIMATION_FRAMES[0])
    this.startAnimation()

    contentEl.createEl('h3', { text: 'AI Mind Map Generation' })

    this.messageEl = contentEl.createEl('p', { cls: 'easymind-progress-message' })
    this.messageEl.setText('Initializing...')
  }

  onClose(): void {
    this.stopAnimation()
    this.contentEl.empty()
  }

  update(progress: LLMProgress): void {
    if (this.messageEl) {
      this.messageEl.setText(progress.message)
    }

    if (progress.phase === 'done' || progress.phase === 'error') {
      this.stopAnimation()
      if (this.animationEl) {
        this.animationEl.setText(progress.phase === 'done' ? 'Done!' : 'Error')
      }
    }
  }

  private startAnimation(): void {
    this.animationInterval = window.setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % ANIMATION_FRAMES.length
      if (this.animationEl) {
        this.animationEl.setText(ANIMATION_FRAMES[this.frameIndex])
      }
    }, 400)
  }

  private stopAnimation(): void {
    if (this.animationInterval !== null) {
      window.clearInterval(this.animationInterval)
      this.animationInterval = null
    }
  }
}
