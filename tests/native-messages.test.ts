import { describe, expect, it } from 'vitest'

import { parseHostMessage, parsePanelMessage } from '../src/shared/native-messages'

describe('parsePanelMessage', () => {
  it('accepts session lifecycle, input, resize, and restart messages', () => {
    expect(parsePanelMessage({ type: 'create', sessionId: 'terminal-1' })).toEqual({
      type: 'create',
      sessionId: 'terminal-1'
    })
    expect(parsePanelMessage({ type: 'close', sessionId: 'terminal-1' })).toEqual({
      type: 'close',
      sessionId: 'terminal-1'
    })
    expect(parsePanelMessage({ type: 'input', sessionId: 'terminal-1', data: 'codex\r' })).toEqual({
      type: 'input',
      sessionId: 'terminal-1',
      data: 'codex\r'
    })
    expect(parsePanelMessage({ type: 'resize', sessionId: 'terminal-1', cols: 120, rows: 40 })).toEqual({
      type: 'resize',
      sessionId: 'terminal-1',
      cols: 120,
      rows: 40
    })
    expect(parsePanelMessage({ type: 'restart', sessionId: 'terminal-1' })).toEqual({
      type: 'restart',
      sessionId: 'terminal-1'
    })
  })

  it('rejects unknown, oversized, and unsafe messages', () => {
    expect(parsePanelMessage({ type: 'input', sessionId: 'terminal-1', data: 'x'.repeat(65_537) })).toBeNull()
    expect(parsePanelMessage({ type: 'resize', sessionId: 'terminal-1', cols: 1, rows: 40 })).toBeNull()
    expect(parsePanelMessage({ type: 'create', sessionId: '../unsafe' })).toBeNull()
    expect(parsePanelMessage({ type: 'input', data: 'missing session' })).toBeNull()
    expect(parsePanelMessage({ type: 'command', data: 'rm' })).toBeNull()
    expect(parsePanelMessage(null)).toBeNull()
  })
})

describe('parseHostMessage', () => {
  it('accepts host status, output, exit, and error messages', () => {
    expect(parseHostMessage({ type: 'ready', sessionId: 'terminal-1' })).toEqual({
      type: 'ready',
      sessionId: 'terminal-1'
    })
    expect(parseHostMessage({ type: 'output', sessionId: 'terminal-1', data: 'hello' })).toEqual({
      type: 'output',
      sessionId: 'terminal-1',
      data: 'hello'
    })
    expect(parseHostMessage({ type: 'exit', sessionId: 'terminal-1', exitCode: 0, signal: 15 })).toEqual({
      type: 'exit',
      sessionId: 'terminal-1',
      exitCode: 0,
      signal: 15
    })
    expect(parseHostMessage({ type: 'error', sessionId: 'terminal-1', message: 'failed' })).toEqual({
      type: 'error',
      sessionId: 'terminal-1',
      message: 'failed'
    })
    expect(parseHostMessage({ type: 'error', message: 'connection failed' })).toEqual({
      type: 'error',
      message: 'connection failed'
    })
  })

  it('rejects malformed host messages', () => {
    expect(parseHostMessage({ type: 'output', sessionId: 'terminal-1', data: 42 })).toBeNull()
    expect(parseHostMessage({ type: 'exit', sessionId: 'terminal-1', exitCode: Number.NaN })).toBeNull()
    expect(parseHostMessage({ type: 'error', message: '' })).toBeNull()
  })
})
