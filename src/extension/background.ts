import type { BridgeHelloMessage, HostToPanelMessage } from '../shared/native-messages'
import { parseHostMessage, parsePanelMessage } from '../shared/native-messages'

const PANEL_PORT_NAME = 'sideterm-panel'
const MAX_BUFFER_LENGTH = 200_000
const panels = new Set<chrome.runtime.Port>()
const outputBuffers = new Map<string, string>()
let nativePort: chrome.runtime.Port | null = null
let bridgeHello: BridgeHelloMessage | null = null

function isReconnectNativeMessage(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'reconnect-native'
}

function restartNative(): void {
  const previousPort = nativePort
  nativePort = null
  bridgeHello = null
  previousPort?.disconnect()
  connectNative()
}

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
  console.error('Unable to configure SideTerm side panel:', error)
})

function broadcast(message: HostToPanelMessage): void {
  for (const panel of panels) panel.postMessage(message)
}

function rememberOutput(sessionId: string, data: string): void {
  const combined = `${outputBuffers.get(sessionId) ?? ''}${data}`
  outputBuffers.set(sessionId, combined.slice(-MAX_BUFFER_LENGTH))
}

function connectNative(): chrome.runtime.Port {
  if (nativePort) return nativePort

  const port = chrome.runtime.connectNative('com.termside.terminal')
  nativePort = port
  port.onMessage.addListener((value: unknown) => {
    const message = parseHostMessage(value)
    if (!message) return
    if (message.type === 'hello') bridgeHello = message
    if (message.type === 'output') rememberOutput(message.sessionId, message.data)
    broadcast(message)
  })
  port.onDisconnect.addListener(() => {
    if (nativePort !== port) return
    nativePort = null
    bridgeHello = null
    const detail = chrome.runtime.lastError?.message ?? 'Native terminal disconnected'
    broadcast({ type: 'error', message: detail })
  })
  return port
}

chrome.runtime.onConnect.addListener((panel) => {
  if (panel.name !== PANEL_PORT_NAME) return
  panels.add(panel)
  connectNative()
  if (bridgeHello) panel.postMessage(bridgeHello)

  panel.onMessage.addListener((value: unknown) => {
    if (isReconnectNativeMessage(value)) {
      restartNative()
      return
    }
    const message = parsePanelMessage(value)
    if (!message) {
      panel.postMessage({ type: 'error', message: 'Invalid terminal message' })
      return
    }

    if (message.type === 'create') {
      const savedOutput = outputBuffers.get(message.sessionId)
      if (savedOutput) {
        panel.postMessage({ type: 'output', sessionId: message.sessionId, data: savedOutput })
      }
    } else if (message.type === 'close' || message.type === 'restart') {
      outputBuffers.delete(message.sessionId)
    }

    connectNative().postMessage(message)
  })

  panel.onDisconnect.addListener(() => {
    panels.delete(panel)
  })
})
