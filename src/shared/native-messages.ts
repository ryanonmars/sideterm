export const SIDETERM_PROTOCOL_VERSION = 1
export const MAX_TERMINAL_SESSIONS = 16

export interface BridgeCapabilities {
  pty: boolean
  localShell: boolean
  systemSsh: boolean
}

export interface BridgeHelloMessage {
  type: 'hello'
  bridgeVersion: string
  protocolVersion: number
  platform: string
  activeShell: string
  availableShells: string[]
  capabilities: BridgeCapabilities
  sessionId?: never
}

export type PanelToHostMessage =
  | { type: 'hello'; protocolVersion: number; sessionId?: never }
  | { type: 'create'; sessionId: string }
  | { type: 'close'; sessionId: string }
  | { type: 'input'; sessionId: string; data: string }
  | { type: 'resize'; sessionId: string; cols: number; rows: number }
  | { type: 'restart'; sessionId: string }

export type HostToPanelMessage =
  | BridgeHelloMessage
  | {
      type: 'incompatible'
      expectedProtocolVersion: number
      receivedProtocolVersion: number
      message: string
      sessionId?: never
    }
  | { type: 'ready'; sessionId: string }
  | { type: 'output'; sessionId: string; data: string }
  | { type: 'exit'; sessionId: string; exitCode: number; signal?: number }
  | { type: 'error'; sessionId?: string; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value)
}

function isShortString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

function isProtocolVersion(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 65_535
}

function parseCapabilities(value: unknown): BridgeCapabilities | null {
  if (!isRecord(value)) return null
  if (
    typeof value.pty !== 'boolean' ||
    typeof value.localShell !== 'boolean' ||
    typeof value.systemSsh !== 'boolean'
  ) {
    return null
  }
  return {
    pty: value.pty,
    localShell: value.localShell,
    systemSsh: value.systemSsh
  }
}

export function parsePanelMessage(value: unknown): PanelToHostMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null
  }

  if (value.type === 'hello') {
    return isProtocolVersion(value.protocolVersion)
      ? { type: 'hello', protocolVersion: value.protocolVersion }
      : null
  }

  if (!isSessionId(value.sessionId)) return null
  const sessionId = value.sessionId

  if (value.type === 'create' || value.type === 'close' || value.type === 'restart') {
    return { type: value.type, sessionId }
  }

  if (value.type === 'input') {
    return typeof value.data === 'string' && value.data.length <= 65_536
      ? { type: 'input', sessionId, data: value.data }
      : null
  }

  if (value.type === 'resize') {
    const { cols, rows } = value
    return Number.isInteger(cols) &&
      Number.isInteger(rows) &&
      (cols as number) >= 2 &&
      (cols as number) <= 500 &&
      (rows as number) >= 1 &&
      (rows as number) <= 500
      ? { type: 'resize', sessionId, cols: cols as number, rows: rows as number }
      : null
  }

  return null
}

export function parseHostMessage(value: unknown): HostToPanelMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null

  if (value.type === 'hello') {
    const capabilities = parseCapabilities(value.capabilities)
    if (
      !isShortString(value.bridgeVersion, 64) ||
      !isProtocolVersion(value.protocolVersion) ||
      !isShortString(value.platform, 64) ||
      !isShortString(value.activeShell, 1_024) ||
      !Array.isArray(value.availableShells) ||
      value.availableShells.length > 64 ||
      !value.availableShells.every((shell) => isShortString(shell, 1_024)) ||
      !capabilities
    ) {
      return null
    }
    return {
      type: 'hello',
      bridgeVersion: value.bridgeVersion,
      protocolVersion: value.protocolVersion,
      platform: value.platform,
      activeShell: value.activeShell,
      availableShells: [...new Set(value.availableShells as string[])],
      capabilities
    }
  }

  if (value.type === 'incompatible') {
    if (
      !isProtocolVersion(value.expectedProtocolVersion) ||
      !isProtocolVersion(value.receivedProtocolVersion) ||
      !isShortString(value.message, 1_024)
    ) {
      return null
    }
    return {
      type: 'incompatible',
      expectedProtocolVersion: value.expectedProtocolVersion,
      receivedProtocolVersion: value.receivedProtocolVersion,
      message: value.message
    }
  }

  if (value.type === 'error') {
    if (typeof value.message !== 'string' || value.message.length === 0) return null
    if (value.sessionId !== undefined && !isSessionId(value.sessionId)) return null
    return {
      type: 'error',
      ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
      message: value.message
    }
  }

  if (!isSessionId(value.sessionId)) return null
  const sessionId = value.sessionId

  if (value.type === 'ready') return { type: 'ready', sessionId }
  if (value.type === 'output') {
    return typeof value.data === 'string' ? { type: 'output', sessionId, data: value.data } : null
  }
  if (value.type === 'exit') {
    if (!Number.isInteger(value.exitCode)) return null
    if (value.signal !== undefined && !Number.isInteger(value.signal)) return null
    return {
      type: 'exit',
      sessionId,
      exitCode: value.exitCode as number,
      ...(value.signal === undefined ? {} : { signal: value.signal as number })
    }
  }

  return null
}
