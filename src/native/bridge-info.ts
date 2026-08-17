import { accessSync, constants, readFileSync } from 'node:fs'
import os from 'node:os'

import {
  SIDETERM_PROTOCOL_VERSION,
  type BridgeHelloMessage
} from '../shared/native-messages'

export const SIDETERM_BRIDGE_VERSION = process.env.SIDETERM_BRIDGE_VERSION || '0.1.2'

function canExecute(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function defaultShell(platform: NodeJS.Platform, environment: NodeJS.ProcessEnv): string {
  if (platform === 'win32') return environment.COMSPEC || 'powershell.exe'
  return environment.SHELL || (platform === 'linux' ? '/bin/bash' : '/bin/zsh')
}

function discoverShells(activeShell: string, platform: NodeJS.Platform): string[] {
  if (platform === 'win32') return [activeShell]

  let configured: string[] = []
  try {
    configured = readFileSync('/etc/shells', 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('/') && canExecute(line))
  } catch {
    // The active shell is enough when the platform has no readable shell registry.
  }

  return [...new Set([activeShell, ...configured].filter((shell) => canExecute(shell)))]
}

function hasSystemSsh(platform: NodeJS.Platform): boolean {
  const candidates =
    platform === 'win32'
      ? ['C:\\Windows\\System32\\OpenSSH\\ssh.exe']
      : ['/usr/bin/ssh', '/usr/local/bin/ssh', '/opt/homebrew/bin/ssh']
  return candidates.some(canExecute)
}

function platformName(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'macOS'
  if (platform === 'win32') return 'Windows'
  if (platform === 'linux') return 'Linux'
  return platform
}

export interface BridgeInfoOptions {
  platform?: NodeJS.Platform
  environment?: NodeJS.ProcessEnv
}

export function createBridgeHello(options: BridgeInfoOptions = {}): BridgeHelloMessage {
  const platform = options.platform ?? os.platform()
  const environment = options.environment ?? process.env
  const activeShell = defaultShell(platform, environment)

  return {
    type: 'hello',
    bridgeVersion: SIDETERM_BRIDGE_VERSION,
    protocolVersion: SIDETERM_PROTOCOL_VERSION,
    platform: platformName(platform),
    activeShell,
    availableShells: discoverShells(activeShell, platform),
    capabilities: {
      pty: true,
      localShell: true,
      systemSsh: hasSystemSsh(platform)
    }
  }
}
