import os from 'node:os'

import { describe, expect, it, vi } from 'vitest'

import { NativeHost, type TerminalController } from '../src/native/native-host'
import {
  TerminalSession,
  type PtyFactory,
  type PtyProcess
} from '../src/native/terminal-session'
import type { HostToPanelMessage } from '../src/shared/native-messages'

class FakePtyProcess implements PtyProcess {
  private dataListener: ((data: string) => void) | null = null
  private exitListener: ((event: { exitCode: number; signal?: number }) => void) | null = null
  readonly writes: string[] = []
  readonly sizes: Array<[number, number]> = []
  killed = false

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
    child.emitExit(7, 15)

    expect(child.writes).toEqual(['codex\r'])
    expect(child.sizes).toEqual([[2, 500]])
    expect(data).toEqual(['ready\r\n'])
    expect(exits).toEqual([{ exitCode: 7, signal: 15 }])
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

  dispose(): void {
    this.disposeCount += 1
  }
}

describe('NativeHost', () => {
  it('creates and independently controls terminal sessions', () => {
    const terminals: FakeTerminal[] = []
    const sent: HostToPanelMessage[] = []
    const host = new NativeHost({
      createTerminal: () => {
        const terminal = new FakeTerminal()
        terminals.push(terminal)
        return terminal
      },
      send: (message) => sent.push(message)
    })

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

  it('forwards output and exit status to the panel', () => {
    const terminal = new FakeTerminal()
    const sent: HostToPanelMessage[] = []
    const host = new NativeHost({ createTerminal: () => terminal, send: (message) => sent.push(message) })

    host.accept({ type: 'create', sessionId: 'terminal-4' })
    terminal.callbacks?.onData('hello\r\n')
    terminal.callbacks?.onExit({ exitCode: 4, signal: 15 })

    expect(sent).toEqual([
      { type: 'ready', sessionId: 'terminal-4' },
      { type: 'output', sessionId: 'terminal-4', data: 'hello\r\n' },
      { type: 'exit', sessionId: 'terminal-4', exitCode: 4, signal: 15 }
    ])
  })

  it('closes one session without disturbing the others', () => {
    const terminals: FakeTerminal[] = []
    const host = new NativeHost({
      createTerminal: () => {
        const terminal = new FakeTerminal()
        terminals.push(terminal)
        return terminal
      },
      send: () => undefined
    })

    host.accept({ type: 'create', sessionId: 'terminal-1' })
    host.accept({ type: 'create', sessionId: 'terminal-2' })
    host.accept({ type: 'close', sessionId: 'terminal-1' })

    expect(terminals[0]?.disposeCount).toBe(1)
    expect(terminals[1]?.disposeCount).toBe(0)
  })

  it('rejects invalid or unknown sessions and disposes every terminal', () => {
    const terminal = new FakeTerminal()
    const sent: HostToPanelMessage[] = []
    const host = new NativeHost({ createTerminal: () => terminal, send: (message) => sent.push(message) })

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
    const host = new NativeHost({ createTerminal: () => terminal, send: (message) => sent.push(message) })

    expect(() => host.accept({ type: 'create', sessionId: 'terminal-9' })).not.toThrow()
    expect(sent).toEqual([
      { type: 'error', sessionId: 'terminal-9', message: 'Unable to start shell: spawn failed' }
    ])
  })
})
