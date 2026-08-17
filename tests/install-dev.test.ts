import { describe, expect, it } from 'vitest'

import {
  createNativeHostManifest,
  extensionIdFromKey,
  legacyNativeHostRegistrationPaths,
  nativeHostRegistrationDirectories
} from '../scripts/install-dev.mjs'

const key =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxDJ/Rhukr7GeKnlQ28cfc3N+oqUl9Wzg60MRgRSdsxOhpnoWJVrre75s/aWXBnbdOWsOZgGi63QY8HmhFDjRqtxKMoTpEDLKeHPH2H3WJ3mbMhK1/LnRfOX135yBil6V29C+gymXCtENYSXqRvm0BfD7Rcr2nXAto/Vn39+6Jvjz57oKM0+OHNKarmCl7bksKFqEbiyZBvYV5dnC5tMQPFfIxeryumHV2Sc9MD+TbZhev5kB2n3W6urI5IJQQotssr8SgJy1p0yOKX5Yww+nvcIbQ1AXdwrRrgg7gITAaCIKI/eqDKcHU4o/3ugx5uRsnkhA0CXCIRXrJqwB4h69HQIDAQAB'

describe('development host installer', () => {
  it('derives the fixed Chromium extension ID', () => {
    expect(extensionIdFromKey(key)).toBe('iibepfapncodkkpognfeamilpdkoimbe')
  })

  it('restricts the native host to SideTerm', () => {
    expect(
      createNativeHostManifest({
        launcherPath: '/repo/dist/native/launch-host',
        extensionId: 'iibepfapncodkkpognfeamilpdkoimbe'
      })
    ).toEqual({
      name: 'com.termside.terminal',
      description: 'SideTerm terminal host',
      path: '/repo/dist/native/launch-host',
      type: 'stdio',
      allowed_origins: ['chrome-extension://iibepfapncodkkpognfeamilpdkoimbe/']
    })
  })

  it('registers with both Brave and the Chrome-compatible macOS lookup path', () => {
    expect(nativeHostRegistrationDirectories('/Users/test')).toEqual([
      '/Users/test/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts',
      '/Users/test/Library/Application Support/Google/Chrome/NativeMessagingHosts'
    ])
  })

  it('finds obsolete Termside and VibeWatch host registrations for cleanup', () => {
    expect(legacyNativeHostRegistrationPaths('/Users/test')).toEqual([
      '/Users/test/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.sideterm.terminal.json',
      '/Users/test/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.vibewatch.terminal.json',
      '/Users/test/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sideterm.terminal.json',
      '/Users/test/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.vibewatch.terminal.json'
    ])
  })
})
