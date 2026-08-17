import type { HostToPanelMessage, PanelToHostMessage } from '../shared/native-messages'
import { parseHostMessage } from '../shared/native-messages'

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

interface TerminalConnectionOptions {
  connectPort?(): NativePort
  getLastError?(): string | undefined
  onMessage(message: HostToPanelMessage): void
  onState(state: ConnectionState): void
  onError(message: string): void
}

export class TerminalConnection {
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
        if (message.type === 'ready') this.options.onState('connected')
        this.options.onMessage(message)
      })
      port.onDisconnect.addListener(() => {
        if (this.port !== port) return
        this.port = null
        const detail = this.getLastError()
        if (detail) this.options.onError(detail)
        this.options.onState('disconnected')
      })
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

  disconnect(): void {
    const port = this.port
    this.port = null
    port?.disconnect()
  }
}
