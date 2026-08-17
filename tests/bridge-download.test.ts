import { describe, expect, it } from 'vitest'

import {
  BRIDGE_RELEASES_URL,
  MACOS_BRIDGE_URL,
  bridgeDownloadFor,
  detectBridgeArchitecture,
  detectBridgePlatform,
  normalizeBridgePlatform
} from '../src/extension/bridge-download'

describe('Bridge downloads', () => {
  it('detects macOS and Linux browser environments', () => {
    expect(detectBridgePlatform('MacIntel', 'Mozilla/5.0')).toBe('macos')
    expect(detectBridgePlatform('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)')).toBe(
      'linux'
    )
    expect(detectBridgePlatform('Win32', 'Mozilla/5.0 (Windows NT 10.0)')).toBe('unsupported')
  })

  it('normalizes Bridge-reported platform names', () => {
    expect(normalizeBridgePlatform('macOS')).toBe('macos')
    expect(normalizeBridgePlatform('Linux')).toBe('linux')
    expect(normalizeBridgePlatform('Windows')).toBe('unsupported')
  })

  it('detects common Linux architectures', () => {
    expect(detectBridgeArchitecture('Mozilla/5.0 (X11; Linux x86_64)')).toBe('x64')
    expect(detectBridgeArchitecture('Mozilla/5.0 (X11; Linux aarch64)')).toBe('arm64')
    expect(detectBridgeArchitecture('Mozilla/5.0')).toBe('unknown')
  })

  it('uses the macOS package and direct Linux packages', () => {
    expect(bridgeDownloadFor('macos').url).toBe(MACOS_BRIDGE_URL)
    expect(bridgeDownloadFor('linux', 'x64')).toMatchObject({
      url: `${BRIDGE_RELEASES_URL}/download/SideTermBridge-linux-x64.deb`,
      alternateUrl: `${BRIDGE_RELEASES_URL}/download/SideTermBridge-linux-x64.rpm`,
      installLabel: 'Download Linux .deb'
    })
  })
})
