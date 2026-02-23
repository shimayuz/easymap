import { Modal, App, Setting, TFile, FuzzySuggestModal, Notice } from 'obsidian'
import { isValidMediaUrl } from '../utils/sanitize'

export type MediaType = 'image' | 'link'

export interface MediaResult {
  readonly type: MediaType
  readonly url: string
  readonly displayText?: string
  readonly isVaultResource: boolean
  readonly rawPath: string
}

type MediaCallback = (result: MediaResult) => void

export class MediaInputModal extends Modal {
  private activeTab: MediaType = 'image'
  private readonly callback: MediaCallback

  constructor(app: App, callback: MediaCallback, initialTab?: MediaType) {
    super(app)
    this.callback = callback
    if (initialTab) {
      this.activeTab = initialTab
    }
  }

  onOpen(): void {
    this.titleEl.setText('メディアを追加')
    this.render()
  }

  onClose(): void {
    this.contentEl.empty()
  }

  private render(): void {
    this.contentEl.empty()

    const tabContainer = this.contentEl.createDiv({ cls: 'easymind-media-tabs' })
    this.renderTab(tabContainer, 'image', '画像')
    this.renderTab(tabContainer, 'link', 'リンク')

    const formContainer = this.contentEl.createDiv({ cls: 'easymind-media-form' })

    if (this.activeTab === 'image') {
      this.renderImageForm(formContainer)
    } else {
      this.renderLinkForm(formContainer)
    }
  }

  private renderTab(container: HTMLElement, type: MediaType, label: string): void {
    const tab = container.createEl('button', {
      text: label,
      cls: `easymind-media-tab ${this.activeTab === type ? 'is-active' : ''}`,
    })
    tab.addEventListener('click', () => {
      this.activeTab = type
      this.render()
    })
  }

  private renderImageForm(container: HTMLElement): void {
    let urlValue = ''
    let altValue = ''

    new Setting(container)
      .setName('画像URL')
      .setDesc('外部画像のURLを入力')
      .addText((text) => {
        text.setPlaceholder('https://example.com/image.png')
        text.onChange((value) => { urlValue = value })
      })

    new Setting(container)
      .setName('代替テキスト')
      .setDesc('画像の説明テキスト (任意)')
      .addText((text) => {
        text.setPlaceholder('画像の説明')
        text.onChange((value) => { altValue = value })
      })

    new Setting(container)
      .addButton((btn) =>
        btn.setButtonText('URL画像を追加').setCta().onClick(() => {
          const trimmedUrl = urlValue.trim()
          if (!trimmedUrl) return
          if (!isValidMediaUrl(trimmedUrl)) {
            new Notice('無効なURL: http, https プロトコルのみ対応')
            return
          }
          this.callback({
            type: 'image',
            url: trimmedUrl,
            displayText: altValue.trim() || undefined,
            isVaultResource: false,
            rawPath: trimmedUrl,
          })
          this.close()
        })
      )

    container.createEl('hr')

    new Setting(container)
      .setName('Vault内画像')
      .setDesc('Vault内の画像ファイルを選択')
      .addButton((btn) =>
        btn.setButtonText('ファイルを選択').onClick(() => {
          new VaultImageSuggestModal(this.app, (file) => {
            const resourcePath = this.app.vault.getResourcePath(file)
            this.callback({
              type: 'image',
              url: resourcePath,
              displayText: file.basename,
              isVaultResource: true,
              rawPath: file.path,
            })
            this.close()
          }).open()
        })
      )
  }

  private renderLinkForm(container: HTMLElement): void {
    let urlValue = ''
    let textValue = ''

    new Setting(container)
      .setName('リンクURL')
      .setDesc('外部リンクのURLを入力')
      .addText((text) => {
        text.setPlaceholder('https://example.com')
        text.onChange((value) => { urlValue = value })
      })

    new Setting(container)
      .setName('表示テキスト')
      .setDesc('リンクの表示名 (任意)')
      .addText((text) => {
        text.setPlaceholder('リンク名')
        text.onChange((value) => { textValue = value })
      })

    new Setting(container)
      .addButton((btn) =>
        btn.setButtonText('外部リンクを追加').setCta().onClick(() => {
          const trimmedUrl = urlValue.trim()
          if (!trimmedUrl) return
          if (!isValidMediaUrl(trimmedUrl)) {
            new Notice('無効なURL: http, https プロトコルのみ対応')
            return
          }
          this.callback({
            type: 'link',
            url: trimmedUrl,
            displayText: textValue.trim() || undefined,
            isVaultResource: false,
            rawPath: trimmedUrl,
          })
          this.close()
        })
      )

    container.createEl('hr')

    new Setting(container)
      .setName('内部リンク')
      .setDesc('Vault内のページを選択')
      .addButton((btn) =>
        btn.setButtonText('ページを選択').onClick(() => {
          new VaultPageSuggestModal(this.app, (file) => {
            const vaultName = encodeURIComponent(this.app.vault.getName())
            const filePath = encodeURIComponent(file.path)
            this.callback({
              type: 'link',
              url: `obsidian://open?vault=${vaultName}&file=${filePath}`,
              displayText: file.basename,
              isVaultResource: true,
              rawPath: file.path,
            })
            this.close()
          }).open()
        })
      )
  }
}

class VaultImageSuggestModal extends FuzzySuggestModal<TFile> {
  private readonly callback: (file: TFile) => void

  constructor(app: App, callback: (file: TFile) => void) {
    super(app)
    this.callback = callback
    this.setPlaceholder('画像ファイルを検索...')
  }

  getItems(): TFile[] {
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']
    return this.app.vault.getFiles().filter((f) =>
      imageExtensions.includes(f.extension.toLowerCase())
    )
  }

  getItemText(item: TFile): string {
    return item.path
  }

  onChooseItem(item: TFile): void {
    this.callback(item)
  }
}

class VaultPageSuggestModal extends FuzzySuggestModal<TFile> {
  private readonly callback: (file: TFile) => void

  constructor(app: App, callback: (file: TFile) => void) {
    super(app)
    this.callback = callback
    this.setPlaceholder('ページを検索...')
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles()
  }

  getItemText(item: TFile): string {
    return item.path
  }

  onChooseItem(item: TFile): void {
    this.callback(item)
  }
}
