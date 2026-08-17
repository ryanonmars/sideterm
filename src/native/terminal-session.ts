import os from 'node:os'

import * as nodePty from 'node-pty'

interface Disposable {
  dispose(): void
}

export interface TerminalExit {
  exitCode: number
  signal?: number
}

export interface PtyProcess {
  onData(listener: (data: string) => void): Disposable
  onExit(listener: (event: TerminalExit) => void): Disposable
  write(data: string): void
  resize(cols: number, rows: number): void
  pause(): void
  resume(): void
  kill(): void
}

export type PtyFactory = (
  shell: string,
  args: string[],
  options: {
    name: string
    cols: number
    rows: number
    cwd: string
    env: Record<string, string>
  }
) => PtyProcess

export interface TerminalSessionOptions {
  spawn?: PtyFactory
  shell?: string
  cwd?: string
  env?: Record<string, string>
  platform?: NodeJS.Platform
}

export interface TerminalCallbacks {
  onData(data: string): void
  onExit(event: TerminalExit): void
}

function stringEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

export class TerminalSession {
  private readonly spawn: PtyFactory
  private readonly shell: string
  private readonly cwd: string
  private readonly env: Record<string, string>
  private readonly args: string[]
  private process: PtyProcess | null = null
  private subscriptions: Disposable[] = []

  constructor(options: TerminalSessionOptions = {}) {
    const platform = options.platform ?? os.platform()
    this.spawn = options.spawn ?? (nodePty.spawn as PtyFactory)
    this.shell =
      options.shell ??
      (platform === 'win32' ? process.env.COMSPEC || 'powershell.exe' : process.env.SHELL || '/bin/zsh')
    this.args = platform === 'win32' ? [] : ['-l']
    this.cwd = options.cwd ?? os.homedir()
    this.env = options.env ?? stringEnvironment(process.env)
  }

  start(callbacks: TerminalCallbacks): void {
    this.stopCurrentProcess()
    const child = this.spawn(this.shell, this.args, {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: this.cwd,
      env: this.env
    })
    this.process = child
    this.subscriptions = [
      child.onData(callbacks.onData),
      child.onExit((event) => {
        if (this.process === child) this.process = null
        callbacks.onExit(event)
      })
    ]
  }

  write(data: string): void {
    this.process?.write(data)
  }

  resize(cols: number, rows: number): void {
    const safeColumns = Math.min(500, Math.max(2, Math.floor(cols)))
    const safeRows = Math.min(500, Math.max(1, Math.floor(rows)))
    this.process?.resize(safeColumns, safeRows)
  }

  pause(): void {
    this.process?.pause()
  }

  resume(): void {
    this.process?.resume()
  }

  dispose(): void {
    this.stopCurrentProcess()
  }

  private stopCurrentProcess(): void {
    for (const subscription of this.subscriptions) subscription.dispose()
    this.subscriptions = []

    if (this.process) {
      try {
        this.process.kill()
      } catch {
        // The process may have exited between the state check and kill.
      }
      this.process = null
    }
  }
}
