const MAX_NATIVE_MESSAGE_BYTES = 1_048_576

export function encodeNativeMessage(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), 'utf8')
  if (payload.byteLength > MAX_NATIVE_MESSAGE_BYTES) {
    throw new Error(`Native message exceeds ${MAX_NATIVE_MESSAGE_BYTES} bytes`)
  }

  const frame = Buffer.allocUnsafe(4 + payload.byteLength)
  frame.writeUInt32LE(payload.byteLength, 0)
  payload.copy(frame, 4)
  return frame
}

export class NativeMessageDecoder {
  private buffered = Buffer.alloc(0)

  push(chunk: Buffer): unknown[] {
    this.buffered = Buffer.concat([this.buffered, chunk])
    const messages: unknown[] = []

    while (this.buffered.byteLength >= 4) {
      const length = this.buffered.readUInt32LE(0)
      if (length > MAX_NATIVE_MESSAGE_BYTES) {
        this.buffered = Buffer.alloc(0)
        throw new Error(`Native message exceeds ${MAX_NATIVE_MESSAGE_BYTES} bytes`)
      }
      if (this.buffered.byteLength < 4 + length) break

      const payload = this.buffered.subarray(4, 4 + length)
      this.buffered = this.buffered.subarray(4 + length)
      try {
        messages.push(JSON.parse(payload.toString('utf8')))
      } catch {
        this.buffered = Buffer.alloc(0)
        throw new Error('Invalid native message JSON')
      }
    }

    return messages
  }
}
