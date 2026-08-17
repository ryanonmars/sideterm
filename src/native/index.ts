import { createBridgeHello } from './bridge-info'
import { NativeHost } from './native-host'
import { NativeMessageDecoder, encodeNativeMessage } from './native-protocol'
import { TerminalSession } from './terminal-session'

const decoder = new NativeMessageDecoder()
let host: NativeHost
host = new NativeHost({
  createTerminal: () => new TerminalSession(),
  send: (message) => {
    if (!process.stdout.write(encodeNativeMessage(message))) host.pauseOutput()
  },
  bridgeHello: createBridgeHello()
})
process.stdout.on('drain', () => host.resumeOutput())
host.announce()
let stopping = false

function stop(exitCode = 0): void {
  if (stopping) return
  stopping = true
  host.dispose()
  process.exitCode = exitCode
  process.stdin.destroy()
}

process.stdin.on('data', (chunk: Buffer) => {
  try {
    for (const value of decoder.push(chunk)) host.accept(value)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(detail)
    process.stdout.write(encodeNativeMessage({ type: 'error', message: detail }))
    stop(1)
  }
})
process.stdin.on('end', () => stop())
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
