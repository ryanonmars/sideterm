import { describe, expect, it } from 'vitest'

import { NativeMessageDecoder, encodeNativeMessage } from '../src/native/native-protocol'

describe('native messaging framing', () => {
  it('writes a little-endian byte length followed by UTF-8 JSON', () => {
    const frame = encodeNativeMessage({ type: 'input', data: 'hé' })

    expect(frame.readUInt32LE(0)).toBe(frame.byteLength - 4)
    expect(JSON.parse(frame.subarray(4).toString('utf8'))).toEqual({ type: 'input', data: 'hé' })
  })

  it('decodes split and combined frames without losing bytes', () => {
    const decoder = new NativeMessageDecoder()
    const first = encodeNativeMessage({ type: 'restart' })
    const second = encodeNativeMessage({ type: 'resize', cols: 80, rows: 24 })

    expect(decoder.push(first.subarray(0, 3))).toEqual([])
    expect(decoder.push(Buffer.concat([first.subarray(3), second]))).toEqual([
      { type: 'restart' },
      { type: 'resize', cols: 80, rows: 24 }
    ])
  })

  it('rejects frames larger than one MiB', () => {
    const decoder = new NativeMessageDecoder()
    const header = Buffer.alloc(4)
    header.writeUInt32LE(1_048_577)

    expect(() => decoder.push(header)).toThrow('Native message exceeds 1048576 bytes')
  })

  it('clears buffered data after malformed JSON', () => {
    const decoder = new NativeMessageDecoder()
    const invalid = Buffer.from('{bad json', 'utf8')
    const frame = Buffer.alloc(4 + invalid.length)
    frame.writeUInt32LE(invalid.length, 0)
    invalid.copy(frame, 4)

    expect(() => decoder.push(frame)).toThrow('Invalid native message JSON')
    expect(decoder.push(encodeNativeMessage({ type: 'restart' }))).toEqual([{ type: 'restart' }])
  })
})
