import { describe, expect, it } from 'vitest'

import {
  EXTENSION_ID,
  LINUX_INSTALL_ROOT,
  createDebianControl,
  createLinuxLauncher,
  createLinuxNativeMessagingManifest,
  createRpmSpec,
  linuxNativeMessagingManifestPaths,
  linuxPackageArchitecture,
  validateLinuxBridgeVersion
} from '../scripts/package-linux.mjs'

describe('Linux Bridge packaging', () => {
  it('creates a native host restricted to the SideTerm extension', () => {
    expect(createLinuxNativeMessagingManifest()).toEqual({
      name: 'com.termside.terminal',
      description: 'SideTerm terminal host',
      path: `${LINUX_INSTALL_ROOT}/launch-host`,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`]
    })
  })

  it('registers the system host for Chrome, Brave, and Chromium', () => {
    expect(linuxNativeMessagingManifestPaths('/payload')).toEqual([
      '/payload/etc/opt/chrome/native-messaging-hosts/com.termside.terminal.json',
      '/payload/etc/chromium/native-messaging-hosts/com.termside.terminal.json'
    ])
  })

  it('launches the bundled Linux runtime', () => {
    expect(createLinuxLauncher()).toBe(
      '#!/bin/sh\nexec "/opt/sideterm/bridge/bin/node" "/opt/sideterm/bridge/lib/host.cjs"\n'
    )
  })

  it('maps Node architectures to Linux package formats', () => {
    expect(linuxPackageArchitecture('x64')).toEqual({
      deb: 'amd64',
      rpm: 'x86_64',
      asset: 'x64'
    })
    expect(linuxPackageArchitecture('arm64')).toEqual({
      deb: 'arm64',
      rpm: 'aarch64',
      asset: 'arm64'
    })
    expect(() => linuxPackageArchitecture('ia32')).toThrow('Unsupported Linux architecture')
  })

  it('creates Debian and RPM package metadata', () => {
    expect(createDebianControl({ version: '1.2.3', architecture: 'amd64' })).toContain(
      'Architecture: amd64'
    )
    const spec = createRpmSpec({ version: '1.2.3', architecture: 'x86_64' })
    expect(spec).toContain('Version: 1.2.3')
    expect(spec).toContain('BuildArch: x86_64')
    expect(spec).toContain('/etc/opt/chrome/native-messaging-hosts/com.termside.terminal.json')
  })

  it('rejects unsafe release versions', () => {
    expect(validateLinuxBridgeVersion('1.2.3')).toBe('1.2.3')
    expect(() => validateLinuxBridgeVersion('../../tmp')).toThrow('major.minor.patch')
    expect(() => validateLinuxBridgeVersion('1.2.3</Version>')).toThrow('major.minor.patch')
  })
})
