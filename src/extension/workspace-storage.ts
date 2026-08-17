import type { TerminalWorkspaceSnapshot } from './workspace-state'

const STORAGE_KEY = 'sideterm-workspace'
const LEGACY_STORAGE_KEY = 'termside-workspace'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function isSnapshot(value: unknown): value is TerminalWorkspaceSnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.layout !== 'columns' && candidate.layout !== 'rows') return false
  if (candidate.activeId !== null && typeof candidate.activeId !== 'string') return false
  if (!Array.isArray(candidate.tabs)) return false

  const ids = new Set<string>()
  for (const tab of candidate.tabs) {
    if (!tab || typeof tab !== 'object') return false
    const item = tab as Record<string, unknown>
    if (
      typeof item.id !== 'string' ||
      !/^terminal-\d+$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.title !== 'string' ||
      item.title.length === 0 ||
      typeof item.pinned !== 'boolean' ||
      (item.customTitle !== undefined && typeof item.customTitle !== 'boolean')
    ) {
      return false
    }
    ids.add(item.id)
  }

  return candidate.activeId === null || ids.has(candidate.activeId)
}

export function loadWorkspace(storage: StorageLike = localStorage): TerminalWorkspaceSnapshot | null {
  try {
    const saved = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY)
    if (!saved) return null
    const value: unknown = JSON.parse(saved)
    return isSnapshot(value) ? value : null
  } catch {
    return null
  }
}

export function saveWorkspace(
  snapshot: TerminalWorkspaceSnapshot,
  storage: StorageLike = localStorage
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // A terminal should remain usable even when browser storage is unavailable.
  }
}
