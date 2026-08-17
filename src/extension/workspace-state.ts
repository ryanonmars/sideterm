import { MAX_TERMINAL_SESSIONS } from '../shared/native-messages'

export type LayoutDirection = 'columns' | 'rows'

export interface TerminalTab {
  id: string
  title: string
  pinned: boolean
  customTitle?: boolean
}

export interface TerminalWorkspaceSnapshot {
  tabs: TerminalTab[]
  activeId: string | null
  layout: LayoutDirection
}

export class TerminalWorkspaceState {
  readonly tabs: TerminalTab[] = []
  activeId: string | null = null
  layout: LayoutDirection = 'columns'

  get visibleIds(): string[] {
    return this.tabs
      .filter((tab) => tab.pinned || tab.id === this.activeId)
      .map((tab) => tab.id)
  }

  add(id: string): TerminalTab {
    if (this.tabs.length >= MAX_TERMINAL_SESSIONS) {
      throw new RangeError(`Terminal limit reached (${MAX_TERMINAL_SESSIONS})`)
    }
    const tab = { id, title: `Terminal ${this.tabs.length + 1}`, pinned: false }
    this.tabs.push(tab)
    this.activeId = id
    return tab
  }

  restore(snapshot: TerminalWorkspaceSnapshot): void {
    this.tabs.splice(
      0,
      this.tabs.length,
      ...snapshot.tabs.slice(0, MAX_TERMINAL_SESSIONS).map((tab) => ({ ...tab }))
    )
    this.activeId = this.tabs.some((tab) => tab.id === snapshot.activeId)
      ? snapshot.activeId
      : (this.tabs.at(-1)?.id ?? null)
    this.layout = snapshot.layout
    this.renumberTabs()
  }

  snapshot(): TerminalWorkspaceSnapshot {
    return {
      tabs: this.tabs.map((tab) => ({ ...tab })),
      activeId: this.activeId,
      layout: this.layout
    }
  }

  close(id: string): void {
    if (this.tabs.length <= 1) return
    const index = this.tabs.findIndex((tab) => tab.id === id)
    if (index < 0) return
    const wasActive = this.activeId === id
    this.tabs.splice(index, 1)
    this.renumberTabs()
    if (wasActive) {
      this.activeId = this.tabs[Math.min(index, this.tabs.length - 1)]?.id ?? null
    }
  }

  setActive(id: string): void {
    if (this.tabs.some((tab) => tab.id === id)) this.activeId = id
  }

  rename(id: string, title: string): boolean {
    const tab = this.tabs.find((candidate) => candidate.id === id)
    const nextTitle = title.trim().slice(0, 48)
    if (!tab || !nextTitle) return false
    tab.title = nextTitle
    tab.customTitle = true
    return true
  }

  togglePinned(id: string): void {
    const index = this.tabs.findIndex((candidate) => candidate.id === id)
    if (index < 0) return

    const tab = this.tabs[index]
    if (!tab) return
    tab.pinned = !tab.pinned
    if (tab.pinned && this.activeId === id && this.tabs.length > 1) {
      this.activeId = this.tabs[index - 1]?.id ?? this.tabs[index + 1]?.id ?? id
    }
  }

  setLayout(layout: LayoutDirection): void {
    this.layout = layout
  }

  private renumberTabs(): void {
    this.tabs.forEach((tab, index) => {
      if (!tab.customTitle) tab.title = `Terminal ${index + 1}`
    })
  }
}
