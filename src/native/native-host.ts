import type { BridgeHelloMessage, HostToPanelMessage } from '../shared/native-messages'
import { parsePanelMessage } from '../shared/native-messages'
import type { TerminalCallbacks } from './terminal-session'

export interface TerminalController {
  start(callbacks: TerminalCallbacks): void
  write(data: string): void
  resize(cols: number, rows: number): void
  dispose(): void
}

interface NativeHostOptions {
  createTerminal(): TerminalController
  send(message: HostToPanelMessage): void
  bridgeHello: BridgeHelloMessage
}

export class NativeHost {
  private readonly sessions = new Map<string, TerminalController>()
  private incompatibleProtocol: number | null = null

  constructor(private readonly options: NativeHostOptions) {}

  announce(): void {
    this.options.send(this.options.bridgeHello)
  }

  accept(value: unknown): void {
    const message = parsePanelMessage(value)
    if (!message) {
      this.options.send({ type: 'error', message: 'Invalid terminal message' })
      return
    }

    if (message.type === 'hello') {
      if (message.protocolVersion !== this.options.bridgeHello.protocolVersion) {
        this.incompatibleProtocol = message.protocolVersion
        this.options.send({
          type: 'incompatible',
          expectedProtocolVersion: this.options.bridgeHello.protocolVersion,
          receivedProtocolVersion: message.protocolVersion,
          message: `Unsupported SideTerm protocol version ${message.protocolVersion}`
        })
        return
      }
      this.incompatibleProtocol = null
      this.announce()
      return
    }

    if (this.incompatibleProtocol !== null) {
      this.options.send({
        type: 'incompatible',
        expectedProtocolVersion: this.options.bridgeHello.protocolVersion,
        receivedProtocolVersion: this.incompatibleProtocol,
        message: 'Update SideTerm or SideTerm Bridge before opening a terminal'
      })
      return
    }

    if (message.type === 'create') {
      this.create(message.sessionId)
      return
    }
    if (message.type === 'close') {
      this.close(message.sessionId)
      return
    }

    const terminal = this.sessions.get(message.sessionId)
    if (!terminal) {
      this.options.send({
        type: 'error',
        sessionId: message.sessionId,
        message: 'Terminal session not found'
      })
      return
    }

    if (message.type === 'input') terminal.write(message.data)
    else if (message.type === 'resize') terminal.resize(message.cols, message.rows)
    else this.startShell(message.sessionId, terminal)
  }

  dispose(): void {
    for (const terminal of this.sessions.values()) terminal.dispose()
    this.sessions.clear()
  }

  private create(sessionId: string): void {
    const existing = this.sessions.get(sessionId)
    if (existing) {
      this.options.send({ type: 'ready', sessionId })
      return
    }

    const terminal = this.options.createTerminal()
    this.sessions.set(sessionId, terminal)
    this.startShell(sessionId, terminal)
  }

  private close(sessionId: string): void {
    const terminal = this.sessions.get(sessionId)
    if (!terminal) return
    this.sessions.delete(sessionId)
    terminal.dispose()
  }

  private startShell(sessionId: string, terminal: TerminalController): void {
    try {
      terminal.start({
        onData: (data) => {
          if (this.sessions.get(sessionId) === terminal) {
            this.options.send({ type: 'output', sessionId, data })
          }
        },
        onExit: (event) => {
          if (this.sessions.get(sessionId) === terminal) {
            this.options.send({ type: 'exit', sessionId, ...event })
          }
        }
      })
      this.options.send({ type: 'ready', sessionId })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      terminal.dispose()
      this.sessions.delete(sessionId)
      this.options.send({
        type: 'error',
        sessionId,
        message: `Unable to start shell: ${detail}`
      })
    }
  }
}
