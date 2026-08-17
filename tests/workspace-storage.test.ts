import { describe, expect, it } from 'vitest'

import { loadWorkspace, saveWorkspace } from '../src/extension/workspace-storage'

class MemoryStorage {
  values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('workspace storage', () => {
  it('round trips valid terminal workspace state', () => {
    const storage = new MemoryStorage()
    const snapshot = {
      tabs: [{ id: 'terminal-2', title: 'Terminal 2', pinned: true }],
      activeId: 'terminal-2',
      layout: 'rows' as const
    }

    saveWorkspace(snapshot, storage)

    expect(loadWorkspace(storage)).toEqual(snapshot)
  })

  it('persists custom terminal names', () => {
    const storage = new MemoryStorage()
    const snapshot = {
      tabs: [
        { id: 'terminal-2', title: 'Dev server', pinned: false, customTitle: true }
      ],
      activeId: 'terminal-2',
      layout: 'columns' as const
    }

    saveWorkspace(snapshot, storage)

    expect(loadWorkspace(storage)).toEqual(snapshot)
  })

  it('ignores malformed saved data', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      'sideterm-workspace',
      JSON.stringify({ tabs: [{ id: '../bad' }], activeId: null, layout: 'grid' })
    )

    expect(loadWorkspace(storage)).toBeNull()
  })

  it('rejects oversized workspaces and terminal names', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      'sideterm-workspace',
      JSON.stringify({
        tabs: Array.from({ length: 17 }, (_, index) => ({
          id: `terminal-${index + 1}`,
          title: 'Terminal',
          pinned: false
        })),
        activeId: 'terminal-1',
        layout: 'columns'
      })
    )
    expect(loadWorkspace(storage)).toBeNull()

    storage.values.set(
      'sideterm-workspace',
      JSON.stringify({
        tabs: [{ id: 'terminal-1', title: 'x'.repeat(49), pinned: false }],
        activeId: 'terminal-1',
        layout: 'columns'
      })
    )
    expect(loadWorkspace(storage)).toBeNull()
  })

  it('restores workspace state saved under the previous product name', () => {
    const storage = new MemoryStorage()
    const snapshot = {
      tabs: [{ id: 'terminal-1', title: 'Terminal 1', pinned: false }],
      activeId: 'terminal-1',
      layout: 'columns' as const
    }
    storage.values.set('termside-workspace', JSON.stringify(snapshot))

    expect(loadWorkspace(storage)).toEqual(snapshot)
  })
})
