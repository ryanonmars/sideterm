import { describe, expect, it, vi } from 'vitest'

import {
  TerminalConnection,
  type NativePort,
  type PortEvent
} from '../src/extension/terminal-connection'
import type { HostToPanelMessage } from '../src/shared/native-messages'

class FakeEvent<T extends (...args: never[]) => void> implements PortEvent<T> {
  private listeners: T[] = []

  addListener(listener: T): void {
    this.listeners.push(listener)
  }

  emit(...args: Parameters<T>): void {
    for (const listener of this.listeners) listener(...args)
  }
}

class FakePort implements NativePort {
  readonly onMessage = new FakeEvent<(message: unknown) => void>()
  readonly onDisconnect = new FakeEvent<() => void>()
  readonly messages: unknown[] = []
  disconnected = false

  postMessage(message: unknown): void {
    this.messages.push(message)
  }

  disconnect(): void {
    this.disconnected = true
  }
}

describe('TerminalConnection', () => {
  it('connects to the SideTerm background and reports ready', () => {
    const port = new FakePort()
    const states: string[] = []
    const connectPort = vi.fn(() => port)
    const connection = new TerminalConnection({
      connectPort,
      onMessage: () => undefined,
      onState: (state) => states.push(state),
      onError: () => undefined
    })

    connection.connect()
    port.onMessage.emit({ type: 'ready', sessionId: 'terminal-1' })

    expect(connectPort).toHaveBeenCalledOnce()
    expect(states).toEqual(['connecting', 'connected'])
  })

  it('forwards valid messages in both directions while connected', () => {
    const port = new FakePort()
    const received: HostToPanelMessage[] = []
    const connection = new TerminalConnection({
      connectPort: () => port,
      onMessage: (message) => received.push(message),
      onState: () => undefined,
      onError: () => undefined
    })

    connection.connect()
    connection.send({ type: 'input', sessionId: 'terminal-1', data: 'pwd\r' })
    port.onMessage.emit({ type: 'output', sessionId: 'terminal-1', data: '/Users/test\r\n' })
    port.onMessage.emit({ type: 'bogus' })

    expect(port.messages).toEqual([{ type: 'input', sessionId: 'terminal-1', data: 'pwd\r' }])
    expect(received).toEqual([
      { type: 'output', sessionId: 'terminal-1', data: '/Users/test\r\n' }
    ])
  })

  it('reports native disconnect details and stops sending', () => {
    const port = new FakePort()
    const states: string[] = []
    const errors: string[] = []
    const connection = new TerminalConnection({
      connectPort: () => port,
      getLastError: () => 'Specified native messaging host not found.',
      onMessage: () => undefined,
      onState: (state) => states.push(state),
      onError: (message) => errors.push(message)
    })

    connection.connect()
    port.onDisconnect.emit()
    connection.send({ type: 'input', sessionId: 'terminal-1', data: 'ignored' })

    expect(states).toEqual(['connecting', 'disconnected'])
    expect(errors).toEqual(['Specified native messaging host not found.'])
    expect(port.messages).toEqual([])
  })

  it('disconnects an existing port before replacing or closing it', () => {
    const first = new FakePort()
    const second = new FakePort()
    const ports = [first, second]
    const connection = new TerminalConnection({
      connectPort: () => ports.shift()!,
      onMessage: () => undefined,
      onState: () => undefined,
      onError: () => undefined
    })

    connection.connect()
    connection.connect()
    connection.disconnect()

    expect(first.disconnected).toBe(true)
    expect(second.disconnected).toBe(true)
  })
})
