import { createHash } from 'node:crypto'
import { access, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST_NAME = 'com.termside.terminal'
const LEGACY_HOST_NAMES = ['com.sideterm.terminal', 'com.vibewatch.terminal']
const EXPECTED_EXTENSION_ID = 'iibepfapncodkkpognfeamilpdkoimbe'

/**
 * @param {string} key
 * @returns {string}
 */
export function extensionIdFromKey(key) {
  const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest().subarray(0, 16)
  return [...digest]
    .flatMap((byte) => [byte >> 4, byte & 15])
    .map((nibble) => String.fromCharCode(97 + nibble))
    .join('')
}

/**
 * @param {{ launcherPath: string, extensionId: string }} options
 */
export function createNativeHostManifest({ launcherPath, extensionId }) {
  return {
    name: HOST_NAME,
    description: 'SideTerm terminal host',
    path: launcherPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`]
  }
}

/** @param {string} homeDirectory */
export function nativeHostRegistrationDirectories(homeDirectory) {
  return [
    resolve(
      homeDirectory,
      'Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts'
    ),
    resolve(homeDirectory, 'Library/Application Support/Google/Chrome/NativeMessagingHosts')
  ]
}

/** @param {string} homeDirectory */
export function legacyNativeHostRegistrationPaths(homeDirectory) {
  return nativeHostRegistrationDirectories(homeDirectory).flatMap((directory) =>
    LEGACY_HOST_NAMES.map((hostName) => resolve(directory, `${hostName}.json`))
  )
}

/** @param {string} value */
function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

async function install() {
  if (process.platform !== 'darwin') throw new Error('The development installer currently supports macOS only.')

  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const extensionDirectory = resolve(repositoryRoot, 'dist/extension')
  const extensionManifestPath = resolve(extensionDirectory, 'manifest.json')
  const nativeHostPath = resolve(repositoryRoot, 'dist/native/host.cjs')
  const launcherPath = resolve(repositoryRoot, 'dist/native/launch-host')
  await access(nativeHostPath)

  const extensionManifest = JSON.parse(await readFile(extensionManifestPath, 'utf8'))
  const extensionId = extensionIdFromKey(extensionManifest.key)
  if (extensionId !== EXPECTED_EXTENSION_ID) {
    throw new Error(`Extension ID mismatch: expected ${EXPECTED_EXTENSION_ID}, received ${extensionId}`)
  }

  const launcher = `#!/bin/zsh\nexec ${shellQuote(process.execPath)} ${shellQuote(nativeHostPath)}\n`
  await writeFile(launcherPath, launcher, 'utf8')
  await chmod(launcherPath, 0o755)

  const registrationPaths = []
  for (const registrationDirectory of nativeHostRegistrationDirectories(os.homedir())) {
    const registrationPath = resolve(registrationDirectory, `${HOST_NAME}.json`)
    await mkdir(registrationDirectory, { recursive: true })
    await writeFile(
      registrationPath,
      `${JSON.stringify(createNativeHostManifest({ launcherPath, extensionId }), null, 2)}\n`,
      'utf8'
    )
    registrationPaths.push(registrationPath)
  }

  for (const legacyPath of legacyNativeHostRegistrationPaths(os.homedir())) {
    await rm(legacyPath, { force: true })
  }

  console.log(`Extension directory: ${extensionDirectory}`)
  console.log(`Extension ID: ${extensionId}`)
  for (const registrationPath of registrationPaths) {
    console.log(`Native host manifest: ${registrationPath}`)
  }
  console.log('Open brave://extensions, enable Developer mode, and load the extension directory unpacked.')
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  install().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
