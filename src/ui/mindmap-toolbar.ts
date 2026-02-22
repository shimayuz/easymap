interface ToolbarCallbacks {
  readonly onZoomIn: () => void
  readonly onZoomOut: () => void
  readonly onFitView: () => void
  readonly onAIGenerate: () => void
  readonly onAIExpand: () => void
  readonly onExport: () => void
}

export class MindmapToolbar {
  private readonly containerEl: HTMLElement

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.containerEl = parentEl.createDiv({ cls: 'easymind-toolbar' })
    this.buildToolbar(callbacks)
  }

  private buildToolbar(callbacks: ToolbarCallbacks): void {
    const leftGroup = this.containerEl.createDiv({ cls: 'easymind-toolbar-group' })
    const rightGroup = this.containerEl.createDiv({ cls: 'easymind-toolbar-group' })

    this.addButton(leftGroup, 'Zoom In', 'zoom-in', callbacks.onZoomIn)
    this.addButton(leftGroup, 'Zoom Out', 'zoom-out', callbacks.onZoomOut)
    this.addButton(leftGroup, 'Fit View', 'maximize', callbacks.onFitView)

    this.addButton(rightGroup, 'AI Generate', 'sparkles', callbacks.onAIGenerate)
    this.addButton(rightGroup, 'AI Expand', 'git-branch', callbacks.onAIExpand)

    this.addSeparator(rightGroup)

    this.addButton(rightGroup, 'Export to Excalidraw', 'file-down', callbacks.onExport)
  }

  private addButton(
    container: HTMLElement,
    title: string,
    icon: string,
    onClick: () => void
  ): HTMLButtonElement {
    const btn = container.createEl('button', {
      cls: 'easymind-toolbar-btn',
      attr: { 'aria-label': title, title },
    })

    const iconEl = btn.createSpan({ cls: 'easymind-toolbar-icon' })
    this.setIcon(iconEl, icon)

    btn.addEventListener('click', onClick)
    return btn
  }

  private addSeparator(container: HTMLElement): void {
    container.createDiv({ cls: 'easymind-toolbar-separator' })
  }

  private setIcon(el: HTMLElement, iconName: string): void {
    const iconMap: Record<string, string> = {
      'zoom-in': '+',
      'zoom-out': '-',
      'maximize': '[]',
      'sparkles': '*',
      'git-branch': 'Y',
      'file-down': 'E',
    }

    try {
      const obsidian = require('obsidian')
      if (obsidian.setIcon) {
        obsidian.setIcon(el, iconName)
        return
      }
    } catch {
      // fallback
    }

    el.setText(iconMap[iconName] || iconName)
  }
}
