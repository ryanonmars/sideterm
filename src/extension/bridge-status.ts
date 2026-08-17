export type BridgeProblem = 'missing' | 'other'

export function classifyBridgeError(message: string): BridgeProblem {
  const normalized = message.toLowerCase()
  return normalized.includes('native messaging host not found') ||
    normalized.includes('specified native messaging host')
    ? 'missing'
    : 'other'
}
