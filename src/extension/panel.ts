import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'

import {
  MAX_TERMINAL_SESSIONS,
  type BridgeHelloMessage,
  type HostToPanelMessage
} from '../shared/native-messages'
import { classifyBridgeError } from './bridge-status'
import { isBridgeUpdateAvailable, RECOMMENDED_BRIDGE_VERSION } from './bridge-version'
import { TerminalConnection } from './terminal-connection'
import { TerminalWorkspaceState, type TerminalTab } from './workspace-state'
import { loadWorkspace, saveWorkspace } from './workspace-storage'
import './panel.css'

interface TerminalView {
  tab: TerminalTab
  terminal: Terminal
  fitAddon: FitAddon
  pane: HTMLElement
  tabElement: HTMLElement
  selectButton: HTMLButtonElement
  renameButton: HTMLButtonElement
  renameInput: HTMLInputElement
  pinButton: HTMLButtonElement
  closeButton: HTMLButtonElement
  exited: boolean
}

const workspaceElement = document.querySelector<HTMLElement>('#terminal-workspace')!
const tabsElement = document.querySelector<HTMLElement>('#terminal-tabs')!
const addButton = document.querySelector<HTMLButtonElement>('#add-terminal')!
const columnsButton = document.querySelector<HTMLButtonElement>('#layout-columns')!
const rowsButton = document.querySelector<HTMLButtonElement>('#layout-rows')!
const terminalStatus = document.querySelector<HTMLElement>('#terminal-status')!
const reconnectButton = document.querySelector<HTMLButtonElement>('#reconnect-button')!
const toolbarElement = document.querySelector<HTMLElement>('.terminal-toolbar')!
const bridgeOnboarding = document.querySelector<HTMLElement>('#bridge-onboarding')!
const installBridgeLink = document.querySelector<HTMLAnchorElement>('#install-bridge')!
const checkBridgeButton = document.querySelector<HTMLButtonElement>('#check-bridge')!
const bridgeDetail = document.querySelector<HTMLElement>('#bridge-detail')!
const settingsDialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!
const openSettingsButton = document.querySelector<HTMLButtonElement>('#open-settings')!
const closeSettingsButton = document.querySelector<HTMLButtonElement>('#close-settings')!
const settingsReconnectButton = document.querySelector<HTMLButtonElement>('#settings-reconnect')!
const settingsCheckUpdateButton = document.querySelector<HTMLButtonElement>('#settings-check-update')!
const settingsStatus = document.querySelector<HTMLElement>('#settings-status')!
const settingsPlatform = document.querySelector<HTMLElement>('#settings-platform')!
const settingsShell = document.querySelector<HTMLElement>('#settings-shell')!
const settingsBridgeVersion = document.querySelector<HTMLElement>('#settings-bridge-version')!
const settingsProtocolVersion = document.querySelector<HTMLElement>('#settings-protocol-version')!
const settingsSsh = document.querySelector<HTMLElement>('#settings-ssh')!
const bridgeUpdateBanner = document.querySelector<HTMLElement>('#bridge-update-banner')!
const bridgeUpdateMessage = document.querySelector<HTMLElement>('#bridge-update-message')!
const checkBridgeUpdateButton = document.querySelector<HTMLButtonElement>('#check-bridge-update')!
const dismissBridgeUpdateButton = document.querySelector<HTMLButtonElement>('#dismiss-bridge-update')!

const state = new TerminalWorkspaceState()
const views = new Map<string, TerminalView>()
let nextSessionNumber = 1
let focusedId: string | null = null
let layoutFrame = 0
let bridgeInfo: BridgeHelloMessage | null = null
let bridgeUpdateDismissed = false
let settingsCheckPending = false
let settingsCheckTimer: number | undefined
let settingsUpdateTimer: number | undefined

function resetSettingsUpdateFeedback(): void {
  settingsCheckUpdateButton.textContent = 'Check for updates'
  settingsCheckUpdateButton.disabled = false
}

function checkForBridgeUpdate(): void {
  if (bridgeInfo && isBridgeUpdateAvailable(bridgeInfo.bridgeVersion, RECOMMENDED_BRIDGE_VERSION)) {
    bridgeUpdateDismissed = false
    settingsDialog.close()
    renderBridgeUpdate()
    return
  }

  if (settingsUpdateTimer !== undefined) window.clearTimeout(settingsUpdateTimer)
  settingsCheckUpdateButton.textContent = bridgeInfo ? 'Up to date ✓' : 'Connect Bridge first'
  settingsCheckUpdateButton.disabled = true
  settingsUpdateTimer = window.setTimeout(resetSettingsUpdateFeedback, 1_800)
}

function setSettingsCheckFeedback(label: string, disabled = false, success = false): void {
  settingsReconnectButton.textContent = label
  settingsReconnectButton.disabled = disabled
  settingsReconnectButton.classList.toggle('check-success', success)
}

function finishSettingsCheck(success: boolean): void {
  if (!settingsCheckPending) return
  settingsCheckPending = false
  if (settingsCheckTimer !== undefined) window.clearTimeout(settingsCheckTimer)
  setSettingsCheckFeedback(success ? 'Connected ✓' : 'Try again', false, success)
  if (success) {
    settingsCheckTimer = window.setTimeout(() => {
      setSettingsCheckFeedback('Check connection')
    }, 1_600)
  }
}

function beginSettingsCheck(): void {
  settingsCheckPending = true
  if (settingsCheckTimer !== undefined) window.clearTimeout(settingsCheckTimer)
  setSettingsCheckFeedback('Checking…', true)
  settingsCheckTimer = window.setTimeout(() => finishSettingsCheck(false), 5_000)
}

function hideBridgeUpdate(): void {
  bridgeUpdateBanner.hidden = true
  document.body.classList.remove('bridge-update-visible')
}

function renderBridgeUpdate(): void {
  const updateAvailable =
    bridgeInfo && isBridgeUpdateAvailable(bridgeInfo.bridgeVersion, RECOMMENDED_BRIDGE_VERSION)
  if (!updateAvailable || bridgeUpdateDismissed || !bridgeOnboarding.hidden) {
    hideBridgeUpdate()
    return
  }

  bridgeUpdateMessage.textContent = `SideTerm Bridge ${RECOMMENDED_BRIDGE_VERSION} is available.`
  bridgeUpdateBanner.hidden = false
  document.body.classList.add('bridge-update-visible')
}

function renderBridgeSettings(status = bridgeInfo ? 'Connected' : 'Not connected'): void {
  settingsStatus.textContent = status
  settingsStatus.classList.toggle('status-connected', status === 'Connected')
  settingsPlatform.textContent = bridgeInfo?.platform ?? '—'
  settingsShell.textContent = bridgeInfo?.activeShell ?? '—'
  settingsBridgeVersion.textContent = bridgeInfo?.bridgeVersion ?? '—'
  settingsProtocolVersion.textContent = bridgeInfo ? String(bridgeInfo.protocolVersion) : '—'
  settingsSsh.textContent = bridgeInfo ? (bridgeInfo.capabilities.systemSsh ? 'Available' : 'Not found') : '—'
}

function stackIcon(stacked: boolean): string {
  if (stacked) {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 3.5h9v9h-9zM13 3 8 8M8 4v4h4" />
      </svg>`
  }

  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.5 3.5H3.5v9h9v-3M13 3 8 8M12.8 7V3.2H9" />
    </svg>`
}

function pencilIcon(): string {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3 11.5-.5 2 2-.5 7.8-7.8-1.5-1.5zM9.8 4.7l1.5 1.5" />
    </svg>`
}

function createXterm(): { terminal: Terminal; fitAddon: FitAddon } {
  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontFamily: '"SFMono-Regular", "Cascadia Code", Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.28,
    scrollback: 10_000,
    theme: {
      background: '#080a0d',
      foreground: '#c8ced8',
      cursor: '#79a9ff',
      cursorAccent: '#080a0d',
      selectionBackground: '#294d7a',
      black: '#11151a',
      red: '#ff7b72',
      green: '#7ee787',
      yellow: '#e3b341',
      blue: '#79a9ff',
      magenta: '#d2a8ff',
      cyan: '#76e3ea',
      white: '#d8dee9',
      brightBlack: '#626b78',
      brightRed: '#ffa198',
      brightGreen: '#a7f3ad',
      brightYellow: '#f2cc60',
      brightBlue: '#a5c8ff',
      brightMagenta: '#e2c5ff',
      brightCyan: '#a5f0f3',
      brightWhite: '#ffffff'
    }
  })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  return { terminal, fitAddon }
}

function showReconnect(status: string): void {
  terminalStatus.textContent = status
  terminalStatus.hidden = false
  reconnectButton.hidden = false
}

function showBridgeOnboarding(detail: string, updateRequired = false): void {
  hideBridgeUpdate()
  document.body.classList.add('bridge-setup')
  toolbarElement.hidden = true
  workspaceElement.hidden = true
  bridgeOnboarding.hidden = false
  bridgeDetail.textContent = detail
  installBridgeLink.textContent = updateRequired ? 'Update SideTerm Bridge' : 'Install SideTerm Bridge'
  terminalStatus.hidden = true
  reconnectButton.hidden = true
}

function showTerminalWorkspace(): void {
  document.body.classList.remove('bridge-setup')
  bridgeOnboarding.hidden = true
  toolbarElement.hidden = false
  workspaceElement.hidden = false
  bridgeDetail.textContent = ''
  renderBridgeUpdate()
}

function scheduleFit(): void {
  if (layoutFrame) cancelAnimationFrame(layoutFrame)
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0
    for (const id of state.visibleIds) {
      const view = views.get(id)
      if (!view) continue
      view.fitAddon.fit()
      connection.resize(id, view.terminal.cols, view.terminal.rows)
    }
  })
}

function renderWorkspace(): void {
  const visible = new Set(state.visibleIds)
  if (!focusedId || !visible.has(focusedId)) focusedId = state.activeId

  for (const [id, view] of views) {
    const active = id === state.activeId
    const focused = id === focusedId
    view.pane.hidden = !visible.has(id)
    view.pane.classList.toggle('focused', focused)
    view.tabElement.classList.toggle('active', active)
    view.tabElement.classList.toggle('focused', focused)
    view.tabElement.classList.toggle('exited', view.exited)
    view.selectButton.setAttribute('aria-selected', String(active))
    view.selectButton.querySelector<HTMLElement>('.tab-label')!.textContent = view.tab.title
    view.renameButton.title = `Rename ${view.tab.title}`
    view.renameButton.setAttribute('aria-label', `Rename ${view.tab.title}`)
    view.pane.setAttribute('aria-label', view.tab.title)
    view.pinButton.setAttribute('aria-pressed', String(view.tab.pinned))
    view.pinButton.innerHTML = stackIcon(view.tab.pinned)
    view.pinButton.setAttribute(
      'aria-label',
      view.tab.pinned ? `Remove ${view.tab.title} from stack` : `Add ${view.tab.title} to stack`
    )
    view.pinButton.title = view.tab.pinned ? 'Remove from visible stack' : 'Keep visible in stack'
    view.closeButton.hidden = state.tabs.length === 1
    view.closeButton.title = `Close ${view.tab.title}`
    view.closeButton.setAttribute('aria-label', `Close ${view.tab.title}`)
  }

  workspaceElement.classList.toggle('layout-columns', state.layout === 'columns')
  workspaceElement.classList.toggle('layout-rows', state.layout === 'rows')
  workspaceElement.style.setProperty('--pane-count', String(Math.max(1, visible.size)))
  columnsButton.setAttribute('aria-pressed', String(state.layout === 'columns'))
  rowsButton.setAttribute('aria-pressed', String(state.layout === 'rows'))
  addButton.disabled = state.tabs.length >= MAX_TERMINAL_SESSIONS
  addButton.title = addButton.disabled ? `Terminal limit reached (${MAX_TERMINAL_SESSIONS})` : 'New terminal'
  scheduleFit()
}

function startRename(view: TerminalView): void {
  view.selectButton.hidden = true
  view.renameButton.hidden = true
  view.renameInput.hidden = false
  view.renameInput.value = view.tab.title
  view.renameInput.focus()
  view.renameInput.select()
}

function finishRename(view: TerminalView, save: boolean): void {
  if (view.renameInput.hidden) return
  if (save) state.rename(view.tab.id, view.renameInput.value)
  view.renameInput.hidden = true
  view.selectButton.hidden = false
  view.renameButton.hidden = false
  persistWorkspace()
  renderWorkspace()
}

function persistWorkspace(): void {
  saveWorkspace(state.snapshot())
}

function focusTerminal(id: string, switchTab: boolean): void {
  const view = views.get(id)
  if (!view) return
  if (switchTab && !view.tab.pinned) {
    state.setActive(id)
    persistWorkspace()
  }
  focusedId = id
  renderWorkspace()
  requestAnimationFrame(() => view.terminal.focus())
}

function createTabElement(tab: TerminalTab): {
  element: HTMLElement
  selectButton: HTMLButtonElement
  renameButton: HTMLButtonElement
  renameInput: HTMLInputElement
  pinButton: HTMLButtonElement
  closeButton: HTMLButtonElement
} {
  const element = document.createElement('div')
  element.className = 'terminal-tab'
  element.setAttribute('role', 'presentation')

  const selectButton = document.createElement('button')
  selectButton.className = 'tab-select'
  selectButton.type = 'button'
  selectButton.setAttribute('role', 'tab')
  const label = document.createElement('span')
  label.className = 'tab-label'
  label.textContent = tab.title
  selectButton.append(label)
  selectButton.addEventListener('click', () => focusTerminal(tab.id, true))

  const renameInput = document.createElement('input')
  renameInput.className = 'tab-title-input'
  renameInput.type = 'text'
  renameInput.maxLength = 48
  renameInput.hidden = true
  renameInput.setAttribute('aria-label', `Name for ${tab.title}`)

  const renameButton = document.createElement('button')
  renameButton.className = 'tab-action rename-button'
  renameButton.type = 'button'
  renameButton.innerHTML = pencilIcon()
  renameButton.title = `Rename ${tab.title}`
  renameButton.setAttribute('aria-label', `Rename ${tab.title}`)
  renameButton.addEventListener('click', () => {
    const view = views.get(tab.id)
    if (view) startRename(view)
  })

  const pinButton = document.createElement('button')
  pinButton.className = 'tab-action pin-button'
  pinButton.type = 'button'
  pinButton.innerHTML = stackIcon(false)
  pinButton.setAttribute('aria-label', `Add ${tab.title} to stack`)
  pinButton.addEventListener('click', () => {
    state.togglePinned(tab.id)
    focusedId = tab.id
    persistWorkspace()
    renderWorkspace()
  })

  const closeButton = document.createElement('button')
  closeButton.className = 'tab-action close-button'
  closeButton.type = 'button'
  closeButton.textContent = '×'
  closeButton.title = `Close ${tab.title}`
  closeButton.setAttribute('aria-label', `Close ${tab.title}`)
  closeButton.addEventListener('click', () => closeTerminal(tab.id))

  const restartButton = document.createElement('button')
  restartButton.className = 'tab-action restart-button'
  restartButton.type = 'button'
  restartButton.textContent = '↻'
  restartButton.title = `Restart ${tab.title}`
  restartButton.setAttribute('aria-label', `Restart ${tab.title}`)
  restartButton.addEventListener('click', () => {
    connection.restartSession(tab.id)
  })

  element.append(selectButton, renameInput, renameButton, pinButton, restartButton, closeButton)
  return { element, selectButton, renameButton, renameInput, pinButton, closeButton }
}

function mountTerminal(tab: TerminalTab): void {
  const id = tab.id
  const pane = document.createElement('section')
  pane.className = 'terminal-pane'
  pane.setAttribute('role', 'tabpanel')
  pane.setAttribute('aria-label', tab.title)
  const surface = document.createElement('div')
  surface.className = 'terminal-surface'
  pane.append(surface)
  pane.addEventListener('pointerdown', () => focusTerminal(id, false))

  const { terminal, fitAddon } = createXterm()
  const tabControls = createTabElement(tab)
  const view: TerminalView = {
    tab,
    terminal,
    fitAddon,
    pane,
    tabElement: tabControls.element,
    selectButton: tabControls.selectButton,
    renameButton: tabControls.renameButton,
    renameInput: tabControls.renameInput,
    pinButton: tabControls.pinButton,
    closeButton: tabControls.closeButton,
    exited: false
  }
  views.set(id, view)
  tabControls.renameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      finishRename(view, true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      finishRename(view, false)
    }
  })
  tabControls.renameInput.addEventListener('blur', () => finishRename(view, true))
  tabsElement.append(tabControls.element)
  workspaceElement.append(pane)
  terminal.open(surface)
  terminal.onData((data) => connection.write(id, data))
  terminal.onResize(({ cols, rows }) => connection.resize(id, cols, rows))

  connection.createSession(id)
}

function addTerminal(): void {
  if (state.tabs.length >= MAX_TERMINAL_SESSIONS) return
  const id = `terminal-${nextSessionNumber++}`
  const tab = state.add(id)
  focusedId = id
  mountTerminal(tab)
  persistWorkspace()
  renderWorkspace()
  requestAnimationFrame(() => views.get(id)?.terminal.focus())
}

function closeTerminal(id: string): void {
  if (state.tabs.length <= 1) return
  const view = views.get(id)
  if (!view) return
  connection.closeSession(id)
  view.terminal.dispose()
  view.pane.remove()
  view.tabElement.remove()
  views.delete(id)
  state.close(id)
  focusedId = state.activeId
  persistWorkspace()
  renderWorkspace()
}

function handleHostMessage(message: HostToPanelMessage): void {
  if (message.type === 'hello') {
    bridgeInfo = message
    if (!isBridgeUpdateAvailable(message.bridgeVersion, RECOMMENDED_BRIDGE_VERSION)) {
      bridgeUpdateDismissed = false
    }
    renderBridgeSettings()
    finishSettingsCheck(true)
    showTerminalWorkspace()
    scheduleFit()
    return
  }
  if (message.type === 'incompatible') {
    finishSettingsCheck(false)
    bridgeInfo = null
    renderBridgeSettings('Update required')
    showBridgeOnboarding('Your installed Bridge is not compatible with this version of SideTerm.', true)
    return
  }
  if (message.type === 'error' && !message.sessionId) {
    finishSettingsCheck(false)
    bridgeInfo = null
    renderBridgeSettings('Not connected')
    if (classifyBridgeError(message.message) === 'missing') {
      showBridgeOnboarding('SideTerm Bridge is not installed or could not be found.')
    } else {
      showReconnect(message.message)
    }
    return
  }
  if (!message.sessionId) return
  const view = views.get(message.sessionId)
  if (!view) return

  if (message.type === 'ready') {
    view.exited = false
    renderWorkspace()
  } else if (message.type === 'output') {
    view.terminal.write(message.data)
  } else if (message.type === 'exit') {
    view.exited = true
    view.terminal.write(`\r\n\x1b[90m[Shell exited with code ${message.exitCode}]\x1b[0m\r\n`)
    renderWorkspace()
  } else if (message.type === 'error') {
    view.exited = true
    view.terminal.write(`\r\n\x1b[31m[${message.message}]\x1b[0m\r\n`)
    renderWorkspace()
  }
}

const connection = new TerminalConnection({
  onMessage: handleHostMessage,
  onState: (connectionState) => {
    if (connectionState === 'connecting') {
      renderBridgeSettings('Checking…')
      terminalStatus.hidden = true
      reconnectButton.hidden = true
    } else if (connectionState === 'connected') {
      showTerminalWorkspace()
      terminalStatus.hidden = true
      reconnectButton.hidden = true
      scheduleFit()
    } else if (reconnectButton.hidden) {
      finishSettingsCheck(false)
      bridgeInfo = null
      renderBridgeSettings('Not connected')
      showReconnect('Disconnected')
    }
  },
  onError: (message) => {
    finishSettingsCheck(false)
    if (classifyBridgeError(message) === 'missing') {
      showBridgeOnboarding('SideTerm Bridge is not installed or could not be found.')
    } else {
      showReconnect(message)
    }
  }
})

function restartBridgeAndSessions(): void {
  if (!bridgeOnboarding.hidden) bridgeDetail.textContent = 'Checking for SideTerm Bridge…'
  for (const view of views.values()) {
    view.terminal.reset()
    view.exited = false
  }
  connection.connect()
  connection.restartBridge()
  for (const tab of state.tabs) connection.createSession(tab.id)
}

function checkBridgeConnection(): void {
  renderBridgeSettings('Checking…')
  beginSettingsCheck()
  connection.checkBridge()
}

addButton.addEventListener('click', addTerminal)
columnsButton.addEventListener('click', () => {
  state.setLayout('columns')
  persistWorkspace()
  renderWorkspace()
})
rowsButton.addEventListener('click', () => {
  state.setLayout('rows')
  persistWorkspace()
  renderWorkspace()
})
reconnectButton.addEventListener('click', restartBridgeAndSessions)
checkBridgeButton.addEventListener('click', restartBridgeAndSessions)
checkBridgeUpdateButton.addEventListener('click', restartBridgeAndSessions)
dismissBridgeUpdateButton.addEventListener('click', () => {
  bridgeUpdateDismissed = true
  hideBridgeUpdate()
})
openSettingsButton.addEventListener('click', () => {
  renderBridgeSettings()
  settingsDialog.showModal()
})
closeSettingsButton.addEventListener('click', () => settingsDialog.close())
settingsReconnectButton.addEventListener('click', checkBridgeConnection)
settingsCheckUpdateButton.addEventListener('click', checkForBridgeUpdate)
window.addEventListener('pagehide', () => connection.disconnect())
new ResizeObserver(scheduleFit).observe(workspaceElement)

connection.connect()
const savedWorkspace = loadWorkspace()
if (savedWorkspace?.tabs.length) {
  state.restore(savedWorkspace)
  nextSessionNumber =
    Math.max(0, ...state.tabs.map((tab) => Number.parseInt(tab.id.replace('terminal-', ''), 10))) + 1
  focusedId = state.activeId
  for (const tab of state.tabs) mountTerminal(tab)
  renderWorkspace()
  requestAnimationFrame(() => {
    if (state.activeId) views.get(state.activeId)?.terminal.focus()
  })
} else {
  addTerminal()
}
