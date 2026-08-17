export type BridgePlatform = 'macos' | 'linux' | 'unsupported'
export type BridgeArchitecture = 'x64' | 'arm64' | 'unknown'

export const BRIDGE_RELEASES_URL = 'https://github.com/ryanonmars/sideterm/releases/latest'
export const MACOS_BRIDGE_URL = `${BRIDGE_RELEASES_URL}/download/SideTermBridge.pkg`

function browserPlatform(): string {
  return typeof navigator === 'undefined' ? '' : navigator.platform
}

function browserUserAgent(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

function linuxBridgeUrl(architecture: Exclude<BridgeArchitecture, 'unknown'>, extension: 'deb' | 'rpm') {
  return `${BRIDGE_RELEASES_URL}/download/SideTermBridge-linux-${architecture}.${extension}`
}

export interface BridgeDownload {
  platform: BridgePlatform
  url: string
  installLabel: string
  description: string
  notice?: string
  alternateUrl?: string
  alternateLabel?: string
  updateUrl?: string
}

export function detectBridgePlatform(
  platform = browserPlatform(),
  userAgent = browserUserAgent()
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

export function detectBridgeArchitecture(userAgent = browserUserAgent()): BridgeArchitecture {
  const value = userAgent.toLowerCase()
  if (value.includes('aarch64') || value.includes('arm64')) return 'arm64'
  if (value.includes('x86_64') || value.includes('x86-64') || value.includes('amd64')) return 'x64'
  return 'unknown'
}

export function bridgeDownloadFor(
  platform: BridgePlatform,
  architecture = detectBridgeArchitecture()
): BridgeDownload {
  if (platform === 'macos') {
    return {
      platform,
      url: MACOS_BRIDGE_URL,
      installLabel: 'Install SideTerm Bridge',
      updateUrl: MACOS_BRIDGE_URL,
      description:
        "Install the Bridge to use your Mac's shell, files, developer tools, and existing SSH setup."
    }
  }

  if (platform === 'linux') {
    if (architecture === 'unknown') {
      return {
        platform,
        url: BRIDGE_RELEASES_URL,
        installLabel: 'Choose Linux installer',
        updateUrl: BRIDGE_RELEASES_URL,
        description:
          'Choose the .deb or .rpm Bridge package that matches your Linux system, then reconnect SideTerm.'
      }
    }

    return {
      platform,
      url: linuxBridgeUrl(architecture, 'deb'),
      installLabel: 'Download Linux .deb',
      alternateUrl: linuxBridgeUrl(architecture, 'rpm'),
      alternateLabel: 'Need an .rpm instead?',
      updateUrl: BRIDGE_RELEASES_URL,
      description:
        'For Linux Mint, Ubuntu, and Debian, download the .deb package. Use the .rpm option for Fedora and related systems.',
      notice:
        'Linux browser requirement: use Brave or Chrome installed from its .deb package. Flatpak versions cannot connect to local terminal apps, including SideTerm Bridge.'
    }
  }

  return {
    platform,
    url: BRIDGE_RELEASES_URL,
    installLabel: 'View Bridge downloads',
    updateUrl: BRIDGE_RELEASES_URL,
    description: 'SideTerm Bridge is currently available for macOS and Linux.'
  }
}
