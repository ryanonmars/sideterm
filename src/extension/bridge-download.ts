export type BridgePlatform = 'macos' | 'linux' | 'unsupported'

export const BRIDGE_RELEASES_URL = 'https://github.com/ryanonmars/sideterm/releases/latest'
export const MACOS_BRIDGE_URL = `${BRIDGE_RELEASES_URL}/download/SideTermBridge.pkg`

export interface BridgeDownload {
  platform: BridgePlatform
  url: string
  installLabel: string
  description: string
}

export function detectBridgePlatform(
  platform = navigator.platform,
  userAgent = navigator.userAgent
): BridgePlatform {
  const value = `${platform} ${userAgent}`.toLowerCase()
  if (value.includes('linux') || value.includes('x11')) return 'linux'
  if (value.includes('mac')) return 'macos'
  return 'unsupported'
}

export function normalizeBridgePlatform(value: string): BridgePlatform {
  const platform = value.toLowerCase()
  if (platform === 'linux') return 'linux'
  if (platform === 'macos' || platform === 'darwin') return 'macos'
  return 'unsupported'
}

export function bridgeDownloadFor(platform: BridgePlatform): BridgeDownload {
  if (platform === 'macos') {
    return {
      platform,
      url: MACOS_BRIDGE_URL,
      installLabel: 'Install SideTerm Bridge',
      description:
        "Install the Bridge to use your Mac's shell, files, developer tools, and existing SSH setup."
    }
  }

  if (platform === 'linux') {
    return {
      platform,
      url: BRIDGE_RELEASES_URL,
      installLabel: 'Choose Linux installer',
      description:
        'Choose the .deb or .rpm Bridge package for your Linux system, then reconnect SideTerm.'
    }
  }

  return {
    platform,
    url: BRIDGE_RELEASES_URL,
    installLabel: 'View Bridge downloads',
    description: 'SideTerm Bridge is currently available for macOS and Linux.'
  }
}
