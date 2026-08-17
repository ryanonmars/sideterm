import { describe, expect, it } from 'vitest'

import { TerminalWorkspaceState } from '../src/extension/workspace-state'

describe('TerminalWorkspaceState', () => {
  it('adds tabs and shows only the active terminal by default', () => {
    const state = new TerminalWorkspaceState()

    state.add('terminal-1')
    state.add('terminal-2')

    expect(state.activeId).toBe('terminal-2')
    expect(state.visibleIds).toEqual(['terminal-2'])
    expect(state.tabs.map((tab) => tab.title)).toEqual(['Terminal 1', 'Terminal 2'])
  })

  it('keeps pinned terminals visible beside the active tab', () => {
    const state = new TerminalWorkspaceState()
    state.add('terminal-1')
    state.togglePinned('terminal-1')
    state.add('terminal-2')

    expect(state.visibleIds).toEqual(['terminal-1', 'terminal-2'])

    state.setActive('terminal-1')
    expect(state.visibleIds).toEqual(['terminal-1'])
  })

  it('immediately stacks an active terminal beside its previous tab', () => {
    const state = new TerminalWorkspaceState()
    state.add('terminal-1')
    state.add('terminal-2')

    state.togglePinned('terminal-2')

    expect(state.activeId).toBe('terminal-1')
    expect(state.visibleIds).toEqual(['terminal-1', 'terminal-2'])
  })

  it('closes a tab and activates its nearest neighbor', () => {
    const state = new TerminalWorkspaceState()
    state.add('terminal-1')
    state.add('terminal-2')
    state.add('terminal-3')

    state.close('terminal-3')
    expect(state.activeId).toBe('terminal-2')

    state.close('terminal-1')
    expect(state.tabs).toEqual([{ id: 'terminal-2', title: 'Terminal 1', pinned: false }])

    state.close('terminal-2')
    expect(state.tabs).toHaveLength(1)
  })

  it('numbers tabs by their current position after closing and adding', () => {
    const state = new TerminalWorkspaceState()
    state.add('terminal-1')
    state.add('terminal-2')
    state.add('terminal-3')

    state.close('terminal-2')
    expect(state.tabs.map((tab) => tab.title)).toEqual(['Terminal 1', 'Terminal 2'])

    expect(state.add('terminal-4').title).toBe('Terminal 3')
  })

  it('renames a tab and preserves its custom name while default tabs renumber', () => {
    const state = new TerminalWorkspaceState()
    state.add('terminal-1')
    state.add('terminal-2')
    state.add('terminal-3')

    expect(state.rename('terminal-2', '  Server logs  ')).toBe(true)
    state.close('terminal-1')

    expect(state.tabs.map((tab) => tab.title)).toEqual(['Server logs', 'Terminal 2'])
    expect(state.snapshot().tabs[0]?.customTitle).toBe(true)
  })

  it('does not replace a tab name with whitespace', () => {
    const state = new TerminalWorkspaceState()
    state.add('terminal-1')

    expect(state.rename('terminal-1', '   ')).toBe(false)
    expect(state.tabs[0]?.title).toBe('Terminal 1')
  })

  it('switches between side-by-side and top-bottom layouts', () => {
    const state = new TerminalWorkspaceState()

    expect(state.layout).toBe('columns')
    state.setLayout('rows')
    expect(state.layout).toBe('rows')
  })

  it('restores tabs, selection, pins, and layout from a snapshot', () => {
    const state = new TerminalWorkspaceState()
    state.restore({
      tabs: [
        { id: 'terminal-3', title: 'Terminal 1', pinned: true },
        { id: 'terminal-7', title: 'Terminal 2', pinned: false }
      ],
      activeId: 'terminal-7',
      layout: 'rows'
    })

    expect(state.snapshot()).toEqual({
      tabs: [
        { id: 'terminal-3', title: 'Terminal 1', pinned: true },
        { id: 'terminal-7', title: 'Terminal 2', pinned: false }
      ],
      activeId: 'terminal-7',
      layout: 'rows'
    })
    expect(state.add('terminal-8').title).toBe('Terminal 3')
  })
})
