import { describe, expect, it } from 'vitest'

import {
  BRIDGE_IDENTIFIER,
  EXTENSION_ID,
  INSTALL_ROOT,
  createDistributionXml,
  createLauncher,
  createNativeMessagingManifest,
  notarytoolCredentialArgs,
  nativeMessagingManifestPaths
} from '../scripts/package-macos.mjs'

describe('macOS Bridge packaging', () => {
  it('creates a self-contained launcher that uses the private runtime', () => {
    expect(createLauncher()).toBe(
      `#!/bin/zsh\nexec "${INSTALL_ROOT}/bin/node" "${INSTALL_ROOT}/lib/host.cjs"\n`
    )
  })

  it('restricts native messaging to the fixed SideTerm extension', () => {
    expect(createNativeMessagingManifest()).toEqual({
      name: 'com.termside.terminal',
      description: 'SideTerm terminal host',
      path: `${INSTALL_ROOT}/launch-host`,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`]
    })
  })

  it('installs registrations for Chrome and Brave', () => {
    expect(nativeMessagingManifestPaths('/payload')).toEqual([
      '/payload/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.termside.terminal.json',
      '/payload/Library/Google/Chrome/NativeMessagingHosts/com.termside.terminal.json'
    ])
  })

  it('builds a system-only installer distribution', () => {
    const xml = createDistributionXml({
      version: '1.2.3',
      componentPackageName: 'SideTermBridge-component.pkg'
    })

    expect(xml).toContain(`<pkg-ref id="${BRIDGE_IDENTIFIER}" version="1.2.3"`)
    expect(xml).toContain('enable_localSystem="true"')
    expect(xml).toContain('enable_currentUserHome="false"')
    expect(xml).toContain('SideTermBridge-component.pkg')
  })

  it('supports App Store Connect API credentials without exposing key contents', () => {
    expect(
      notarytoolCredentialArgs({
        SIDETERM_NOTARY_KEY_PATH: '/secure/AuthKey_TEST.p8',
        SIDETERM_NOTARY_KEY_ID: 'TESTKEY123',
        SIDETERM_NOTARY_ISSUER: '11111111-2222-3333-4444-555555555555'
      })
    ).toEqual([
      '--key',
      '/secure/AuthKey_TEST.p8',
      '--key-id',
      'TESTKEY123',
      '--issuer',
      '11111111-2222-3333-4444-555555555555'
    ])
  })
})
