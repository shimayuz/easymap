import { App, Plugin, PluginSettingTab, Setting } from 'obsidian'
import type { EasyMindSettings } from '../types'

interface SettingsHost extends Plugin {
  settings: EasyMindSettings
  saveSettings(): Promise<void>
}

export class EasyMindSettingTab extends PluginSettingTab {
  private readonly host: SettingsHost

  constructor(app: App, plugin: SettingsHost) {
    super(app, plugin)
    this.host = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl('h2', { text: 'EasyMind Settings' })

    containerEl.createEl('h3', { text: 'AI Settings' })

    const warningEl = containerEl.createDiv({ cls: 'easymind-api-key-warning' })
    warningEl.createEl('strong', { text: 'Security Notice: ' })
    warningEl.createSpan({
      text: 'API Key is stored in this Vault\'s .obsidian/plugins/easymind/data.json. ' +
        'If you manage this Vault with Git or share it with others, ' +
        'make sure data.json is listed in your .gitignore to prevent key leakage.',
    })

    new Setting(containerEl)
      .setName('Anthropic API Key')
      .setDesc('Your Anthropic API key for AI-powered mind map generation')
      .addText((text) => {
        text
          .setPlaceholder('sk-ant-...')
          .setValue(this.host.settings.anthropicApiKey)
          .onChange(async (value) => {
            this.host.settings = { ...this.host.settings, anthropicApiKey: value }
            await this.host.saveSettings()
          })
        text.inputEl.type = 'password'
        return text
      })
      .addExtraButton((button) =>
        button
          .setIcon('eye')
          .setTooltip('Show/Hide API Key')
          .onClick(() => {
            const input = button.extraSettingsEl.parentElement?.querySelector('input')
            if (input) {
              input.type = input.type === 'password' ? 'text' : 'password'
              button.setIcon(input.type === 'password' ? 'eye' : 'eye-off')
            }
          })
      )

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Claude model to use for generation')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('claude-haiku-4-5-20251001', 'Claude Haiku 4.5 (Fast, Low Cost)')
          .addOption('claude-sonnet-4-6', 'Claude Sonnet 4.6 (Balanced)')
          .setValue(this.host.settings.model)
          .onChange(async (value) => {
            this.host.settings = { ...this.host.settings, model: value }
            await this.host.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Max Depth')
      .setDesc('Maximum depth of AI-generated mind map nodes (2-6)')
      .addSlider((slider) =>
        slider
          .setLimits(2, 6, 1)
          .setValue(this.host.settings.maxDepth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.host.settings = { ...this.host.settings, maxDepth: value }
            await this.host.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Language')
      .setDesc('Language for AI-generated content')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('ja', 'Japanese')
          .addOption('en', 'English')
          .setValue(this.host.settings.language)
          .onChange(async (value) => {
            this.host.settings = {
              ...this.host.settings,
              language: value as 'ja' | 'en',
            }
            await this.host.saveSettings()
          })
      )

    containerEl.createEl('h3', { text: 'Sync Settings' })

    new Setting(containerEl)
      .setName('Auto Sync')
      .setDesc('Automatically sync changes between Markdown and mind map')
      .addToggle((toggle) =>
        toggle
          .setValue(this.host.settings.autoSync)
          .onChange(async (value) => {
            this.host.settings = { ...this.host.settings, autoSync: value }
            await this.host.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Debounce Delay (ms)')
      .setDesc('Delay before syncing changes (200-2000ms)')
      .addSlider((slider) =>
        slider
          .setLimits(200, 2000, 100)
          .setValue(this.host.settings.debounceDelay)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.host.settings = { ...this.host.settings, debounceDelay: value }
            await this.host.saveSettings()
          })
      )

    containerEl.createEl('h3', { text: 'Display Settings' })

    new Setting(containerEl)
      .setName('Theme')
      .setDesc('Mind map color theme')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('auto', 'Auto (Follow Obsidian)')
          .addOption('light', 'Light')
          .addOption('dark', 'Dark')
          .setValue(this.host.settings.theme)
          .onChange(async (value) => {
            this.host.settings = {
              ...this.host.settings,
              theme: value as 'auto' | 'light' | 'dark',
            }
            await this.host.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Direction')
      .setDesc('Mind map layout direction')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('right', 'Right')
          .addOption('left', 'Left')
          .addOption('side', 'Both Sides')
          .setValue(this.host.settings.direction)
          .onChange(async (value) => {
            this.host.settings = {
              ...this.host.settings,
              direction: value as 'right' | 'side' | 'left',
            }
            await this.host.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Font Size')
      .setDesc('Base font size for mind map nodes (10-24px)')
      .addSlider((slider) =>
        slider
          .setLimits(10, 24, 1)
          .setValue(this.host.settings.fontSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.host.settings = { ...this.host.settings, fontSize: value }
            await this.host.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Horizontal Gap')
      .setDesc('Horizontal gap between nodes (30-150)')
      .addSlider((slider) =>
        slider
          .setLimits(30, 150, 5)
          .setValue(this.host.settings.nodeHorizontalGap)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.host.settings = { ...this.host.settings, nodeHorizontalGap: value }
            await this.host.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Vertical Gap')
      .setDesc('Vertical gap between sibling nodes (10-80)')
      .addSlider((slider) =>
        slider
          .setLimits(10, 80, 5)
          .setValue(this.host.settings.nodeVerticalGap)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.host.settings = { ...this.host.settings, nodeVerticalGap: value }
            await this.host.saveSettings()
          })
      )

    containerEl.createEl('h3', { text: 'Interaction Settings' })

    new Setting(containerEl)
      .setName('Double-click to create free node')
      .setDesc('Double-click on blank area to create a new child node under root')
      .addToggle((toggle) =>
        toggle
          .setValue(this.host.settings.dblclickFreeNode)
          .onChange(async (value) => {
            this.host.settings = { ...this.host.settings, dblclickFreeNode: value }
            await this.host.saveSettings()
          })
      )
  }
}
