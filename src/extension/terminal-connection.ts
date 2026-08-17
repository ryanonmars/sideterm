import type { HostToPanelMessage, PanelToHostMessage } from '../shared/native-messages'
import { parseHostMessage, SIDETERM_PROTOCOL_VERSION } from '../shared/native-messages'

export interface PortEvent<T extends (...args: never[]) => void> {
  addListener(listener: T): void
}

export interface NativePort {
  postMessage(message: unknown): void
  disconnect(): void
  onMessage: PortEvent<(message: unknown) => void>
  onDisconnect: PortEvent<() => void>
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected'

export interface TerminalBackend {
  connect(): void
  disconnect(): void
  createSession(sessionId: string): void
  closeSession(sessionId: string): void
  write(sessionId: string, data: string): void
  resize(sessionId: string, cols: number, rows: number): void
  restartSession(sessionId: string): void
}

interface TerminalConnectionOptions {
  connectPort?(): NativePort
  getLastError?(): string | undefined
  onMessage(message: HostToPanelMessage): void
  onState(state: ConnectionState): void
  onError(message: string): void
}

export class TerminalConnection implements TerminalBackend {
  private port: NativePort | null = null
  private readonly connectPort: () => NativePort
  private readonly getLastError: () => string | undefined

  constructor(private readonly options: TerminalConnectionOptions) {
    this.connectPort =
      options.connectPort ?? (() => chrome.runtime.connect({ name: 'sideterm-panel' }))
    this.getLastError = options.getLastError ?? (() => chrome.runtime.lastError?.message)
  }

  connect(): void {
    this.disconnect()
    this.options.onState('connecting')

    try {
      const port = this.connectPort()
      this.port = port
      port.onMessage.addListener((value) => {
        const message = parseHostMessage(value)
        if (!message) return
        if (message.type === 'hello' || message.type === 'ready') {
          this.options.onState('connected')
        }
        this.options.onMessage(message)
      })
      port.onDisconnect.addListener(() => {
        if (this.port !== port) return
        this.port = null
        const detail = this.getLastError()
        if (detail) this.options.onError(detail)
        this.options.onState('disconnected')
      })
      port.postMessage({ type: 'hello', protocolVersion: SIDETERM_PROTOCOL_VERSION })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.port = null
      this.options.onError(detail)
      this.options.onState('disconnected')
    }
  }

  send(message: PanelToHostMessage): void {
    this.port?.postMessage(message)
  }

  createSession(sessionId: string): void {
    this.send({ type: 'create', sessionId })
  }

  closeSession(sessionId: string): void {
    this.send({ type: 'close', sessionId })
  }

  write(sessionId: string, data: string): void {
    this.send({ type: 'input', sessionId, data })
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.send({ type: 'resize', sessionId, cols, rows })
  }

  restartSession(sessionId: string): void {
    this.send({ type: 'restart', sessionId })
  }

  disconnect(): void {
    const port = this.port
    this.port = null
    port?.disconnect()
  }
}
