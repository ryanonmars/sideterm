import { describe, expect, it } from 'vitest'

import { classifyBridgeError } from '../src/extension/bridge-status'

describe('bridge status', () => {
  it('recognizes Chrome and Brave missing-host errors', () => {
    expect(classifyBridgeError('Specified native messaging host not found.')).toBe('missing')
    expect(classifyBridgeError('Native messaging host not found')).toBe('missing')
  })

  it('leaves other connection errors available for normal reconnect handling', () => {
    expect(classifyBridgeError('Native host has exited.')).toBe('other')
  })
})
