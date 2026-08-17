import { NativeHost } from './native-host'
import { NativeMessageDecoder, encodeNativeMessage } from './native-protocol'
import { TerminalSession } from './terminal-session'

const decoder = new NativeMessageDecoder()
const host = new NativeHost({
  createTerminal: () => new TerminalSession(),
  send: (message) => process.stdout.write(encodeNativeMessage(message))
})
let stopping = false

function stop(exitCode = 0): void {
  if (stopping) return
  stopping = true
  host.dispose()
  process.exitCode = exitCode
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
