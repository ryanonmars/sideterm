import type { BridgeHelloMessage, HostToPanelMessage } from '../shared/native-messages'
import { MAX_TERMINAL_SESSIONS, parsePanelMessage } from '../shared/native-messages'
import type { TerminalCallbacks } from './terminal-session'

export interface TerminalController {
  start(callbacks: TerminalCallbacks): void
  write(data: string): void
  resize(cols: number, rows: number): void
  pause(): void
  resume(): void
  dispose(): void
}

// This remains comfortably below Chrome's 1 MiB native-messaging frame limit,
// including worst-case JSON escaping of every JavaScript character.
const MAX_TERMINAL_OUTPUT_CHARS = 64_000

interface NativeHostOptions {
  createTerminal(): TerminalController
  send(message: HostToPanelMessage): void
  bridgeHello: BridgeHelloMessage
}

export class NativeHost {
  private readonly sessions = new Map<string, TerminalController>()
  private incompatibleProtocol: number | null = null
  private handshakeComplete = false
  private outputPaused = false

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
        this.handshakeComplete = false
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
      this.handshakeComplete = true
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

    if (!this.handshakeComplete) {
      this.options.send({ type: 'error', message: 'SideTerm Bridge handshake required' })
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

  pauseOutput(): void {
    if (this.outputPaused) return
    this.outputPaused = true
    for (const terminal of this.sessions.values()) terminal.pause()
  }

  resumeOutput(): void {
    if (!this.outputPaused) return
    this.outputPaused = false
    for (const terminal of this.sessions.values()) terminal.resume()
  }

  private create(sessionId: string): void {
    const existing = this.sessions.get(sessionId)
    if (existing) {
      this.options.send({ type: 'ready', sessionId })
      return
    }

    if (this.sessions.size >= MAX_TERMINAL_SESSIONS) {
      this.options.send({
        type: 'error',
        sessionId,
        message: `Terminal limit reached (${MAX_TERMINAL_SESSIONS})`
      })
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
            for (let offset = 0; offset < data.length; offset += MAX_TERMINAL_OUTPUT_CHARS) {
              this.options.send({
                type: 'output',
                sessionId,
                data: data.slice(offset, offset + MAX_TERMINAL_OUTPUT_CHARS)
              })
            }
          }
        },
        onExit: (event) => {
          if (this.sessions.get(sessionId) === terminal) {
            this.options.send({ type: 'exit', sessionId, ...event })
          }
        }
      })
      if (this.outputPaused) terminal.pause()
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
