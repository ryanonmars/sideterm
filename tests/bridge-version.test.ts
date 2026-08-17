import { describe, expect, it } from 'vitest'

import { isBridgeUpdateAvailable } from '../src/extension/bridge-version'

describe('Bridge version updates', () => {
  it('detects older major, minor, and patch versions', () => {
    expect(isBridgeUpdateAvailable('0.1.0', '0.1.2')).toBe(true)
    expect(isBridgeUpdateAvailable('0.9.9', '1.0.0')).toBe(true)
    expect(isBridgeUpdateAvailable('1.1.9', '1.2.0')).toBe(true)
  })

  it('does not prompt for current, newer, or unrecognized versions', () => {
    expect(isBridgeUpdateAvailable('0.1.2', '0.1.2')).toBe(false)
    expect(isBridgeUpdateAvailable('0.2.0', '0.1.2')).toBe(false)
    expect(isBridgeUpdateAvailable('development', '0.1.2')).toBe(false)
  })

  it('accepts a leading v in release versions', () => {
    expect(isBridgeUpdateAvailable('v0.1.0', 'v0.1.2')).toBe(true)
  })
})
