import { describe, expect, it } from 'vitest'

import {
  SIDETERM_BRIDGE_VERSION,
  createBridgeHello
} from '../src/native/bridge-info'
import { SIDETERM_PROTOCOL_VERSION } from '../src/shared/native-messages'

describe('createBridgeHello', () => {
  it('reports the active shell, platform, protocol, and detected capabilities', () => {
    const hello = createBridgeHello({
      platform: 'darwin',
      environment: { SHELL: '/bin/zsh' }
    })

    expect(hello).toMatchObject({
      type: 'hello',
      bridgeVersion: SIDETERM_BRIDGE_VERSION,
      protocolVersion: SIDETERM_PROTOCOL_VERSION,
      platform: 'macOS',
      activeShell: '/bin/zsh',
      capabilities: {
        pty: true,
        localShell: true,
        systemSsh: expect.any(Boolean)
      }
    })
    expect(hello.availableShells).toContain(hello.activeShell)
  })

  it('uses bash as the Linux fallback shell', () => {
    const hello = createBridgeHello({ platform: 'linux', environment: {} })

    expect(hello.platform).toBe('Linux')
    expect(hello.activeShell).toBe('/bin/bash')
  })
})
