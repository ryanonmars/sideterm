import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  BRIDGE_IDENTIFIER,
  EXTENSION_ID,
  INSTALL_ROOT,
  assertPrivateKeyPermissions,
  assertReleaseCredentials,
  createDistributionXml,
  createLauncher,
  createNativeMessagingManifest,
  notarytoolCredentialArgs,
  nativeMessagingManifestPaths,
  validateBridgeVersion
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

  it('refuses release builds without signing and safe notarization credentials', () => {
    expect(() => assertReleaseCredentials({})).toThrow('SIDETERM_CODESIGN_IDENTITY')
    expect(() =>
      assertReleaseCredentials({
        SIDETERM_CODESIGN_IDENTITY: 'Developer ID Application',
        SIDETERM_INSTALLER_IDENTITY: 'Developer ID Installer',
        APPLE_ID: 'developer@example.com',
        APPLE_TEAM_ID: 'TEAMID',
        APPLE_APP_PASSWORD: 'must-not-be-passed-on-the-command-line'
      })
    ).toThrow('notary key or keychain profile')
    expect(() =>
      assertReleaseCredentials({
        SIDETERM_CODESIGN_IDENTITY: 'Developer ID Application',
        SIDETERM_INSTALLER_IDENTITY: 'Developer ID Installer',
        SIDETERM_NOTARY_PROFILE: 'SideTerm'
      })
    ).not.toThrow()
  })

  it('rejects notarization keys readable by other local users', async () => {
    const directory = await mkdtemp(join(os.tmpdir(), 'sideterm-key-test-'))
    const keyPath = join(directory, 'AuthKey_TEST.p8')
    try {
      await writeFile(keyPath, 'private test material', { mode: 0o644 })
      await expect(assertPrivateKeyPermissions(keyPath)).rejects.toThrow('mode 600')
      await chmod(keyPath, 0o600)
      await expect(assertPrivateKeyPermissions(keyPath)).resolves.toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects release versions that could escape paths or alter installer XML', () => {
    expect(validateBridgeVersion('1.2.3')).toBe('1.2.3')
    expect(() => validateBridgeVersion('../../tmp/bridge')).toThrow('major.minor.patch')
    expect(() => validateBridgeVersion('1.2.3</pkg-ref>')).toThrow('major.minor.patch')
    expect(() => validateBridgeVersion('v1.2.3')).toThrow('major.minor.patch')
  })
})
