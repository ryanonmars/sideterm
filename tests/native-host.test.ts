import os from 'node:os'

import { describe, expect, it, vi } from 'vitest'

import { NativeHost, type TerminalController } from '../src/native/native-host'
import {
  TerminalSession,
  type PtyFactory,
  type PtyProcess
} from '../src/native/terminal-session'
import type { BridgeHelloMessage, HostToPanelMessage } from '../src/shared/native-messages'

const bridgeHello: BridgeHelloMessage = {
  type: 'hello',
  bridgeVersion: '1.2.3',
  protocolVersion: 1,
  platform: 'macOS',
  activeShell: '/bin/zsh',
  availableShells: ['/bin/zsh', '/bin/bash'],
  capabilities: { pty: true, localShell: true, systemSsh: true }
}

class FakePtyProcess implements PtyProcess {
  private dataListener: ((data: string) => void) | null = null
  private exitListener: ((event: { exitCode: number; signal?: number }) => void) | null = null
  readonly writes: string[] = []
  readonly sizes: Array<[number, number]> = []
  killed = false
  pauseCount = 0
  resumeCount = 0

  onData(listener: (data: string) => void): { dispose(): void } {
    this.dataListener = listener
    return { dispose: () => (this.dataListener = null) }
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void } {
    this.exitListener = listener
    return { dispose: () => (this.exitListener = null) }
  }

  write(data: string): void {
    this.writes.push(data)
  }

  resize(cols: number, rows: number): void {
    this.sizes.push([cols, rows])
  }

  pause(): void {
    this.pauseCount += 1
  }

  resume(): void {
    this.resumeCount += 1
  }

  kill(): void {
    this.killed = true
  }

  emitData(data: string): void {
    this.dataListener?.(data)
  }

  emitExit(exitCode: number, signal?: number): void {
    this.exitListener?.({ exitCode, signal })
  }
}

describe('TerminalSession', () => {
  it('starts a login shell in the user home folder by default', () => {
    const spawn = vi.fn<PtyFactory>(() => new FakePtyProcess())
    const session = new TerminalSession({ spawn, env: { PATH: '/usr/bin' }, platform: 'darwin' })

    session.start({ onData: () => undefined, onExit: () => undefined })

    expect(spawn).toHaveBeenCalledWith(process.env.SHELL || '/bin/zsh', ['-l'], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: os.homedir(),
      env: { PATH: '/usr/bin' }
    })
  })

  it('passes the existing SSH and home environment into the login shell', () => {
    const spawn = vi.fn<PtyFactory>(() => new FakePtyProcess())
    const env = {
      HOME: '/Users/test',
      PATH: '/usr/bin:/bin',
      SSH_AUTH_SOCK: '/private/tmp/ssh-agent.sock'
    }
    const session = new TerminalSession({ spawn, env, shell: '/bin/zsh', cwd: '/Users/test' })

    session.start({ onData: () => undefined, onExit: () => undefined })

    expect(spawn).toHaveBeenCalledWith('/bin/zsh', ['-l'], expect.objectContaining({ env }))
  })

  it('forwards data, input, exit, and safe terminal sizes', () => {
    const child = new FakePtyProcess()
    const session = new TerminalSession({
      spawn: () => child,
      shell: '/bin/zsh',
      cwd: '/Users/test',
      env: { PATH: '/usr/bin' }
    })
    const data: string[] = []
    const exits: Array<{ exitCode: number; signal?: number }> = []

    session.start({ onData: (value) => data.push(value), onExit: (event) => exits.push(event) })
    session.write('codex\r')
    session.resize(0, 9000)
    child.emitData('ready\r\n')
    session.pause()
    session.resume()
    child.emitExit(7, 15)

    expect(child.writes).toEqual(['codex\r'])
    expect(child.sizes).toEqual([[2, 500]])
    expect(data).toEqual(['ready\r\n'])
    expect(exits).toEqual([{ exitCode: 7, signal: 15 }])
    expect(child.pauseCount).toBe(1)
    expect(child.resumeCount).toBe(1)
  })

  it('kills the old process before restart and on dispose', () => {
    const processes: FakePtyProcess[] = []
    const session = new TerminalSession({
      spawn: () => {
        const child = new FakePtyProcess()
        processes.push(child)
        return child
      }
    })
    const callbacks = { onData: () => undefined, onExit: () => undefined }

    session.start(callbacks)
    session.start(callbacks)
    expect(processes[0]?.killed).toBe(true)

    session.dispose()
    expect(processes[1]?.killed).toBe(true)
  })
})

class FakeTerminal implements TerminalController {
  callbacks: Parameters<TerminalController['start']>[0] | null = null
  readonly writes: string[] = []
  readonly sizes: Array<[number, number]> = []
  startCount = 0
  disposeCount = 0
  pauseCount = 0
  resumeCount = 0

  start(callbacks: Parameters<TerminalController['start']>[0]): void {
    this.startCount += 1
    this.callbacks = callbacks
  }

  write(data: string): void {
    this.writes.push(data)
  }

  resize(cols: number, rows: number): void {
    this.sizes.push([cols, rows])
  }

  pause(): void {
    this.pauseCount += 1
  }

  resume(): void {
    this.resumeCount += 1
  }

  dispose(): void {
    this.disposeCount += 1
  }
}

function completeHandshake(host: NativeHost): void {
  host.accept({ type: 'hello', protocolVersion: bridgeHello.protocolVersion })
}

describe('NativeHost', () => {
  it('announces Bridge status and rejects incompatible protocol versions', () => {
    const sent: HostToPanelMessage[] = []
    const createTerminal = vi.fn(() => new FakeTerminal())
    const host = new NativeHost({
      createTerminal,
      send: (message) => sent.push(message),
      bridgeHello
    })

    host.announce()
    host.accept({ type: 'hello', protocolVersion: 1 })
    host.accept({ type: 'hello', protocolVersion: 2 })
    host.accept({ type: 'create', sessionId: 'blocked-terminal' })

    expect(sent).toEqual([
      bridgeHello,
      bridgeHello,
      {
        type: 'incompatible',
        expectedProtocolVersion: 1,
        receivedProtocolVersion: 2,
        message: 'Unsupported SideTerm protocol version 2'
      },
      {
        type: 'incompatible',
        expectedProtocolVersion: 1,
        receivedProtocolVersion: 2,
        message: 'Update SideTerm or SideTerm Bridge before opening a terminal'
      }
    ])
    expect(createTerminal).not.toHaveBeenCalled()
  })

  it('accepts sessions again after a compatible handshake', () => {
    const createTerminal = vi.fn(() => new FakeTerminal())
    const host = new NativeHost({
      createTerminal,
      send: () => undefined,
      bridgeHello
    })

    host.accept({ type: 'hello', protocolVersion: 2 })
    host.accept({ type: 'hello', protocolVersion: 1 })
    host.accept({ type: 'create', sessionId: 'terminal-1' })

    expect(createTerminal).toHaveBeenCalledOnce()
  })

  it('creates and independently controls terminal sessions', () => {
    const terminals: FakeTerminal[] = []
    const sent: HostToPanelMessage[] = []
    const host = new NativeHost({
      createTerminal: () => {
        const terminal = new FakeTerminal()
        terminals.push(terminal)
        return terminal
      },
      send: (message) => sent.push(message),
      bridgeHello
    })
    completeHandshake(host)
    sent.length = 0

    host.accept({ type: 'create', sessionId: 'terminal-1' })
    host.accept({ type: 'create', sessionId: 'terminal-2' })
    host.accept({ type: 'input', sessionId: 'terminal-2', data: 'pwd\r' })
    host.accept({ type: 'resize', sessionId: 'terminal-1', cols: 100, rows: 30 })
    host.accept({ type: 'restart', sessionId: 'terminal-2' })

    expect(sent).toEqual([
      { type: 'ready', sessionId: 'terminal-1' },
      { type: 'ready', sessionId: 'terminal-2' },
      { type: 'ready', sessionId: 'terminal-2' }
    ])
    expect(terminals[0]?.sizes).toEqual([[100, 30]])
    expect(terminals[1]?.writes).toEqual(['pwd\r'])
    expect(terminals[1]?.startCount).toBe(2)
  })

  it('limits terminal processes to prevent resource exhaustion', () => {
    const sent: HostToPanelMessage[] = []
    const createTerminal = vi.fn(() => new FakeTerminal())
    const host = new NativeHost({
      createTerminal,
      send: (message) => sent.push(message),
      bridgeHello
    })
    completeHandshake(host)

    for (let index = 1; index <= 17; index += 1) {
      host.accept({ type: 'create', sessionId: `terminal-${index}` })
    }

    expect(createTerminal).toHaveBeenCalledTimes(16)
    expect(sent).toContainEqual({
      type: 'error',
      sessionId: 'terminal-17',
      message: 'Terminal limit reached (16)'
    })
  })

  it('forwards output and exit status to the panel', () => {
    const terminal = new FakeTerminal()
    const sent: HostToPanelMessage[] = []
    const host = new NativeHost({
      createTerminal: () => terminal,
      send: (message) => sent.push(message),
      bridgeHello
    })
    completeHandshake(host)
    sent.length = 0

    host.accept({ type: 'create', sessionId: 'terminal-4' })
    terminal.callbacks?.onData('hello\r\n')
    terminal.callbacks?.onExit({ exitCode: 4, signal: 15 })

    expect(sent).toEqual([
      { type: 'ready', sessionId: 'terminal-4' },
      { type: 'output', sessionId: 'terminal-4', data: 'hello\r\n' },
      { type: 'exit', sessionId: 'terminal-4', exitCode: 4, signal: 15 }
    ])
  })

  it('chunks large output and pauses sessions during stdout backpressure', () => {
    const terminal = new FakeTerminal()
    const sent: HostToPanelMessage[] = []
    const host = new NativeHost({
      createTerminal: () => terminal,
      send: (message) => sent.push(message),
      bridgeHello
    })
    completeHandshake(host)
    sent.length = 0
    host.accept({ type: 'create', sessionId: 'terminal-large-output' })
    sent.length = 0

    const output = '🚀'.repeat(70_000)
    terminal.callbacks?.onData(output)
    host.pauseOutput()
    host.pauseOutput()
    host.accept({ type: 'restart', sessionId: 'terminal-large-output' })
    host.resumeOutput()
    host.resumeOutput()

    const chunks = sent.filter(
      (message): message is Extract<HostToPanelMessage, { type: 'output' }> =>
        message.type === 'output'
    )
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map((message) => message.data).join('')).toBe(output)
    expect(terminal.pauseCount).toBe(2)
    expect(terminal.resumeCount).toBe(1)
  })

  it('closes one session without disturbing the others', () => {
    const terminals: FakeTerminal[] = []
    const host = new NativeHost({
      createTerminal: () => {
        const terminal = new FakeTerminal()
        terminals.push(terminal)
        return terminal
      },
      send: () => undefined,
      bridgeHello
    })
    completeHandshake(host)

    host.accept({ type: 'create', sessionId: 'terminal-1' })
    host.accept({ type: 'create', sessionId: 'terminal-2' })
    host.accept({ type: 'close', sessionId: 'terminal-1' })

    expect(terminals[0]?.disposeCount).toBe(1)
    expect(terminals[1]?.disposeCount).toBe(0)
  })

  it('rejects invalid or unknown sessions and disposes every terminal', () => {
    const terminal = new FakeTerminal()
    const sent: HostToPanelMessage[] = []
    const host = new NativeHost({
      createTerminal: () => terminal,
      send: (message) => sent.push(message),
      bridgeHello
    })
    completeHandshake(host)

    host.accept({ type: 'create', sessionId: 'terminal-1' })
    host.accept({ type: 'input', sessionId: 'missing', data: 'pwd\r' })
    host.accept({ type: 'resize', sessionId: 'terminal-1', cols: 1, rows: 30 })
    host.dispose()

    expect(sent).toContainEqual({ type: 'error', sessionId: 'missing', message: 'Terminal session not found' })
    expect(sent).toContainEqual({ type: 'error', message: 'Invalid terminal message' })
    expect(terminal.disposeCount).toBe(1)
  })

  it('reports shell launch failures without throwing', () => {
    const terminal = new FakeTerminal()
    terminal.start = () => {
      throw new Error('spawn failed')
    }
    const sent: HostToPanelMessage[] = []
    const host = new NativeHost({
      createTerminal: () => terminal,
      send: (message) => sent.push(message),
      bridgeHello
    })
    completeHandshake(host)
    sent.length = 0

    expect(() => host.accept({ type: 'create', sessionId: 'terminal-9' })).not.toThrow()
    expect(sent).toEqual([
      { type: 'error', sessionId: 'terminal-9', message: 'Unable to start shell: spawn failed' }
    ])
  })

  it('rejects terminal commands before the protocol handshake', () => {
    const sent: HostToPanelMessage[] = []
    const createTerminal = vi.fn(() => new FakeTerminal())
    const host = new NativeHost({
      createTerminal,
      send: (message) => sent.push(message),
      bridgeHello
    })

    host.accept({ type: 'create', sessionId: 'terminal-1' })

    expect(createTerminal).not.toHaveBeenCalled()
    expect(sent).toEqual([{ type: 'error', message: 'SideTerm Bridge handshake required' }])
  })
})
