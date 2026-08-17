import { execFileSync } from 'node:child_process'
import { access, chmod, copyFile, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const BRIDGE_IDENTIFIER = 'com.sideterm.bridge'
export const NATIVE_HOST_NAME = 'com.termside.terminal'
export const EXTENSION_ID = 'iibepfapncodkkpognfeamilpdkoimbe'
export const INSTALL_ROOT = '/Library/Application Support/SideTerm/Bridge'

/** @param {string} payloadRoot */
export function nativeMessagingManifestPaths(payloadRoot) {
  return [
    join(
      payloadRoot,
      'Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts',
      `${NATIVE_HOST_NAME}.json`
    ),
    join(payloadRoot, 'Library/Google/Chrome/NativeMessagingHosts', `${NATIVE_HOST_NAME}.json`)
  ]
}

export function createNativeMessagingManifest() {
  return {
    name: NATIVE_HOST_NAME,
    description: 'SideTerm terminal host',
    path: `${INSTALL_ROOT}/launch-host`,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`]
  }
}

export function createLauncher() {
  return `#!/bin/zsh\nexec "${INSTALL_ROOT}/bin/node" "${INSTALL_ROOT}/lib/host.cjs"\n`
}

/** @param {{ version: string, componentPackageName: string }} options */
export function createDistributionXml({ version, componentPackageName }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
  <title>SideTerm Bridge</title>
  <organization>com.sideterm</organization>
  <domains enable_localSystem="true" enable_currentUserHome="false" enable_anywhere="false"/>
  <options customize="never" require-scripts="false" rootVolumeOnly="true"/>
  <choices-outline>
    <line choice="bridge"/>
  </choices-outline>
  <choice id="bridge" visible="false" title="SideTerm Bridge">
    <pkg-ref id="${BRIDGE_IDENTIFIER}"/>
  </choice>
  <pkg-ref id="${BRIDGE_IDENTIFIER}" version="${version}" onConclusion="none">${componentPackageName}</pkg-ref>
</installer-gui-script>
`
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import('node:child_process').ExecFileSyncOptions} [options]
 */
function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options })
}

/**
 * @param {string} command
 * @param {string[]} args
 */
function runForOutput(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' })
}

/** @param {{ payloadRoot: string, architecture: string }} options */
async function copyRuntime({ payloadRoot, architecture }) {
  const bridgeRoot = join(payloadRoot, INSTALL_ROOT.slice(1))
  const libRoot = join(bridgeRoot, 'lib')
  const nodePtySource = resolve(repositoryRoot, 'node_modules/node-pty')
  const nodePtyTarget = join(libRoot, 'node_modules/node-pty')
  const prebuildName = `darwin-${architecture}`

  await access(process.execPath)
  await access(resolve(repositoryRoot, 'dist/native/host.cjs'))
  await access(join(nodePtySource, 'prebuilds', prebuildName, 'pty.node'))
  await access(join(nodePtySource, 'prebuilds', prebuildName, 'spawn-helper'))

  await mkdir(join(bridgeRoot, 'bin'), { recursive: true })
  await mkdir(nodePtyTarget, { recursive: true })
  await copyFile(process.execPath, join(bridgeRoot, 'bin/node'))
  await copyFile(resolve(repositoryRoot, 'dist/native/host.cjs'), join(libRoot, 'host.cjs'))
  await cp(join(nodePtySource, 'lib'), join(nodePtyTarget, 'lib'), { recursive: true })
  await cp(join(nodePtySource, 'prebuilds', prebuildName), join(nodePtyTarget, 'prebuilds', prebuildName), {
    recursive: true
  })
  await copyFile(join(nodePtySource, 'package.json'), join(nodePtyTarget, 'package.json'))
  await copyFile(join(nodePtySource, 'LICENSE'), join(nodePtyTarget, 'LICENSE'))

  const nodeLicense = resolve(dirname(process.execPath), '..', 'LICENSE')
  await access(nodeLicense)
  await mkdir(join(bridgeRoot, 'licenses'), { recursive: true })
  await copyFile(nodeLicense, join(bridgeRoot, 'licenses', 'Node.js-LICENSE'))

  await writeFile(join(bridgeRoot, 'launch-host'), createLauncher(), 'utf8')
  await chmod(join(bridgeRoot, 'launch-host'), 0o755)
  await chmod(join(bridgeRoot, 'bin/node'), 0o755)
  await chmod(join(nodePtyTarget, 'prebuilds', prebuildName, 'spawn-helper'), 0o755)

  const manifest = `${JSON.stringify(createNativeMessagingManifest(), null, 2)}\n`
  for (const manifestPath of nativeMessagingManifestPaths(payloadRoot)) {
    await mkdir(dirname(manifestPath), { recursive: true })
    await writeFile(manifestPath, manifest, 'utf8')
  }

  return { bridgeRoot, nodePtyTarget, prebuildName }
}

/**
 * @param {{ bridgeRoot: string, nodePtyTarget: string, prebuildName: string, identity?: string }} options
 */
function signRuntime({ bridgeRoot, nodePtyTarget, prebuildName, identity }) {
  if (!identity) return

  /** @param {string} path @param {boolean} [hardenedRuntime] */
  const sign = (path, hardenedRuntime = false) => {
    const args = ['--force', '--timestamp', '--sign', identity]
    if (hardenedRuntime) {
      args.push(
        '--options',
        'runtime',
        '--entitlements',
        resolve(repositoryRoot, 'packaging/macos/node-entitlements.plist')
      )
    }
    args.push(path)
    let lastError
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        run('/usr/bin/codesign', args, { timeout: 30_000, killSignal: 'SIGTERM' })
        return
      } catch (error) {
        lastError = error
        if (attempt < 3) console.log(`Timestamp signing retry ${attempt + 1}/3 for ${path}`)
      }
    }
    throw lastError
  }

  sign(join(nodePtyTarget, 'prebuilds', prebuildName, 'pty.node'))
  sign(join(nodePtyTarget, 'prebuilds', prebuildName, 'spawn-helper'), true)
  sign(join(bridgeRoot, 'bin/node'), true)

  for (const path of [
    join(nodePtyTarget, 'prebuilds', prebuildName, 'pty.node'),
    join(nodePtyTarget, 'prebuilds', prebuildName, 'spawn-helper'),
    join(bridgeRoot, 'bin/node')
  ]) {
    run('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', path])
  }
}

export function notarytoolCredentialArgs(environment = process.env) {
  const keyPath = environment.SIDETERM_NOTARY_KEY_PATH
  const keyId = environment.SIDETERM_NOTARY_KEY_ID
  const issuer = environment.SIDETERM_NOTARY_ISSUER
  if (keyPath && keyId && issuer) {
    return ['--key', keyPath, '--key-id', keyId, '--issuer', issuer]
  }

  const profile = environment.SIDETERM_NOTARY_PROFILE
  if (profile) return ['--keychain-profile', profile]

  return null
}

export function assertReleaseCredentials(environment = process.env) {
  if (!environment.SIDETERM_CODESIGN_IDENTITY) {
    throw new Error('SIDETERM_CODESIGN_IDENTITY is required for a release package.')
  }
  if (!environment.SIDETERM_INSTALLER_IDENTITY) {
    throw new Error('SIDETERM_INSTALLER_IDENTITY is required for a release package.')
  }
  if (!notarytoolCredentialArgs(environment)) {
    throw new Error('A notary key or keychain profile is required for a release package.')
  }
}

/** @param {unknown} version */
export function validateBridgeVersion(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('SideTerm Bridge version must use numeric major.minor.patch format.')
  }
  return version
}

/** @param {string} keyPath */
export async function assertPrivateKeyPermissions(keyPath) {
  const details = await stat(keyPath)
  if (!details.isFile()) throw new Error('The notarization key must be a regular file.')
  if ((details.mode & 0o077) !== 0) {
    throw new Error('The notarization key must not be accessible to group or other users (use mode 600).')
  }
}

/** @param {string} packagePath */
function notarize(packagePath) {
  const credentialArgs = notarytoolCredentialArgs()
  if (!credentialArgs) return false

  const args = [
    'notarytool',
    'submit',
    packagePath,
    ...credentialArgs,
    '--wait',
    '--output-format',
    'json'
  ]
  const result = JSON.parse(runForOutput('/usr/bin/xcrun', args))
  if (result.status !== 'Accepted') {
    throw new Error(`Apple notarization ${result.status || 'failed'} (submission ${result.id || 'unknown'})`)
  }
  console.log(`Apple notarization accepted (submission ${result.id})`)
  run('/usr/bin/xcrun', ['stapler', 'staple', packagePath])
  return true
}

export async function packageMacOS({ stageOnly = false } = {}) {
  if (process.platform !== 'darwin') throw new Error('The macOS Bridge package must be built on macOS.')
  if (!stageOnly) assertReleaseCredentials()

  const notaryKeyPath = process.env.SIDETERM_NOTARY_KEY_PATH
  if (!stageOnly && notaryKeyPath) await assertPrivateKeyPermissions(notaryKeyPath)

  const project = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  const version = validateBridgeVersion(process.env.SIDETERM_BRIDGE_VERSION || project.version)
  const architecture = process.arch
  const releaseRoot = resolve(repositoryRoot, 'release')
  const workRoot = join(releaseRoot, 'macos-work')
  const payloadRoot = join(workRoot, 'payload')
  const packageRoot = join(workRoot, 'packages')
  const distributionPath = join(workRoot, 'Distribution.xml')
  const componentPackageName = `SideTermBridge-${version}-${architecture}-component.pkg`
  const componentPackagePath = join(packageRoot, componentPackageName)
  const outputPath = join(releaseRoot, `SideTermBridge-${version}-${architecture}.pkg`)
  const stableOutputPath = join(releaseRoot, 'SideTermBridge.pkg')

  await rm(workRoot, { recursive: true, force: true })
  if (!stageOnly) await rm(stableOutputPath, { force: true })
  await mkdir(payloadRoot, { recursive: true })
  await mkdir(packageRoot, { recursive: true })

  const runtime = await copyRuntime({ payloadRoot, architecture })
  signRuntime({
    ...runtime,
    identity: process.env.SIDETERM_CODESIGN_IDENTITY
  })
  // Finder metadata is not part of the Bridge and would otherwise become AppleDouble files.
  run('/usr/bin/xattr', ['-cr', payloadRoot])

  if (stageOnly) {
    console.log(`Staged SideTerm Bridge at ${payloadRoot}`)
    return { payloadRoot, outputPath: null }
  }

  run(
    '/usr/bin/pkgbuild',
    [
      '--root',
      payloadRoot,
      '--identifier',
      BRIDGE_IDENTIFIER,
      '--version',
      version,
      '--install-location',
      '/',
      '--ownership',
      'recommended',
      componentPackagePath
    ],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } }
  )

  await writeFile(
    distributionPath,
    createDistributionXml({ version, componentPackageName }),
    'utf8'
  )

  const productArgs = ['--distribution', distributionPath, '--package-path', packageRoot]
  const installerIdentity = process.env.SIDETERM_INSTALLER_IDENTITY
  if (installerIdentity) productArgs.push('--sign', installerIdentity)
  productArgs.push(outputPath)
  run('/usr/bin/productbuild', productArgs)

  const notarized = notarize(outputPath)
  run('/usr/sbin/spctl', ['-a', '-t', 'install', '-vv', outputPath])
  await copyFile(outputPath, stableOutputPath)
  console.log(`Created ${outputPath}`)
  console.log(`Created stable release asset ${stableOutputPath}`)
  if (!notarized) throw new Error('Release package was not notarized.')
  return { payloadRoot, outputPath, stableOutputPath }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  packageMacOS({ stageOnly: process.argv.includes('--stage-only') }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
