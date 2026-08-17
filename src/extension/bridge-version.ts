export const RECOMMENDED_BRIDGE_VERSION = '0.1.3'

function versionParts(value: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim())
  return match ? match.slice(1).map(Number) : null
}

export function isBridgeUpdateAvailable(
  installedVersion: string,
  recommendedVersion = RECOMMENDED_BRIDGE_VERSION
): boolean {
  const installed = versionParts(installedVersion)
  const recommended = versionParts(recommendedVersion)
  if (!installed || !recommended) return false

  for (let index = 0; index < recommended.length; index += 1) {
    const difference = recommended[index]! - installed[index]!
    if (difference !== 0) return difference > 0
  }
  return false
}
