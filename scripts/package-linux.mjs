import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, chmod, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const NATIVE_HOST_NAME = 'com.termside.terminal'
export const DEVELOPMENT_EXTENSION_ID = 'iibepfapncodkkpognfeamilpdkoimbe'
export const STORE_EXTENSION_ID = 'flkmmlbgcjdbfcekhhdjobinlljdifdn'
export const LINUX_INSTALL_ROOT = '/opt/sideterm/bridge'

/** @param {string} payloadRoot */
export function linuxNativeMessagingManifestPaths(payloadRoot) {
  return [
    join(
      payloadRoot,
      'etc/opt/chrome/native-messaging-hosts',
      `${NATIVE_HOST_NAME}.json`
    ),
    join(payloadRoot, 'etc/chromium/native-messaging-hosts', `${NATIVE_HOST_NAME}.json`)
  ]
}

export function createLinuxNativeMessagingManifest() {
  return {
    name: NATIVE_HOST_NAME,
    description: 'SideTerm terminal host',
    path: `${LINUX_INSTALL_ROOT}/launch-host`,
    type: 'stdio',
    allowed_origins: [
      `chrome-extension://${STORE_EXTENSION_ID}/`,
      `chrome-extension://${DEVELOPMENT_EXTENSION_ID}/`
    ]
  }
}

export function createLinuxLauncher() {
  return `#!/bin/sh\nexec "${LINUX_INSTALL_ROOT}/bin/node" "${LINUX_INSTALL_ROOT}/lib/host.cjs"\n`
}

/** @param {NodeJS.Architecture} architecture */
export function linuxPackageArchitecture(architecture) {
  if (architecture === 'x64') return { deb: 'amd64', rpm: 'x86_64', asset: 'x64' }
  if (architecture === 'arm64') return { deb: 'arm64', rpm: 'aarch64', asset: 'arm64' }
  throw new Error(`Unsupported Linux architecture: ${architecture}`)
}

/** @param {unknown} value */
export function validateLinuxBridgeVersion(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error('SideTerm Bridge version must use numeric major.minor.patch format.')
  }
  return value
}

/** @param {{ version: string, architecture: string }} options */
export function createDebianControl({ version, architecture }) {
  return `Package: sideterm-bridge
Version: ${version}
Section: utils
Priority: optional
Architecture: ${architecture}
Maintainer: SideTerm <ryanonmars@users.noreply.github.com>
Description: Native terminal Bridge for the SideTerm browser extension
 SideTerm Bridge connects the SideTerm extension to the user's local shell.
`
}

/** @param {{ version: string, architecture: string }} options */
export function createRpmSpec({ version, architecture }) {
  return `Name: sideterm-bridge
Version: ${version}
Release: 1
Summary: Native terminal Bridge for the SideTerm browser extension
License: MIT
BuildArch: ${architecture}
Source0: sideterm-payload.tar.gz

%description
SideTerm Bridge connects the SideTerm browser extension to the user's local shell.

%prep

%build

%install
mkdir -p %{buildroot}
tar -xzf %{SOURCE0} -C %{buildroot}

%files
%defattr(-,root,root,-)
${LINUX_INSTALL_ROOT}
/etc/opt/chrome/native-messaging-hosts/${NATIVE_HOST_NAME}.json
/etc/chromium/native-messaging-hosts/${NATIVE_HOST_NAME}.json
`
}

/** @param {string} command @param {string[]} args @param {import('node:child_process').ExecFileSyncOptions} [options] */
function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options })
}

/** @param {string} payloadRoot */
async function copyLinuxRuntime(payloadRoot) {
  const bridgeRoot = join(payloadRoot, LINUX_INSTALL_ROOT.slice(1))
  const libRoot = join(bridgeRoot, 'lib')
  const nodePtySource = resolve(repositoryRoot, 'node_modules/node-pty')
  const nodePtyTarget = join(libRoot, 'node_modules/node-pty')
  const nativeSource = join(nodePtySource, 'build/Release')

  await access(process.execPath)
  await access(resolve(repositoryRoot, 'dist/native/host.cjs'))
  await access(join(nativeSource, 'pty.node'))

  await mkdir(join(bridgeRoot, 'bin'), { recursive: true })
  await mkdir(join(nodePtyTarget, 'build/Release'), { recursive: true })
  await copyFile(process.execPath, join(bridgeRoot, 'bin/node'))
  await copyFile(resolve(repositoryRoot, 'dist/native/host.cjs'), join(libRoot, 'host.cjs'))
  await cp(join(nodePtySource, 'lib'), join(nodePtyTarget, 'lib'), { recursive: true })
  await copyFile(join(nativeSource, 'pty.node'), join(nodePtyTarget, 'build/Release/pty.node'))
  await copyFile(join(nodePtySource, 'package.json'), join(nodePtyTarget, 'package.json'))
  await copyFile(join(nodePtySource, 'LICENSE'), join(nodePtyTarget, 'LICENSE'))

  const nodeLicense = resolve(dirname(process.execPath), '..', 'LICENSE')
  await access(nodeLicense)
  await mkdir(join(bridgeRoot, 'licenses'), { recursive: true })
  await copyFile(nodeLicense, join(bridgeRoot, 'licenses/Node.js-LICENSE'))

  await writeFile(join(bridgeRoot, 'launch-host'), createLinuxLauncher(), 'utf8')
  await chmod(join(bridgeRoot, 'launch-host'), 0o755)
  await chmod(join(bridgeRoot, 'bin/node'), 0o755)

  const manifest = `${JSON.stringify(createLinuxNativeMessagingManifest(), null, 2)}\n`
  for (const manifestPath of linuxNativeMessagingManifestPaths(payloadRoot)) {
    await mkdir(dirname(manifestPath), { recursive: true })
    await writeFile(manifestPath, manifest, 'utf8')
  }
}

/** @param {string} path */
async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

export async function packageLinux({ stageOnly = false } = {}) {
  if (process.platform !== 'linux') {
    throw new Error('Linux Bridge packages must be built on Linux.')
  }

  const project = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  const version = validateLinuxBridgeVersion(
    process.env.SIDETERM_BRIDGE_VERSION || project.version
  )
  const architecture = linuxPackageArchitecture(process.arch)
  const releaseRoot = resolve(repositoryRoot, 'release')
  const workRoot = join(releaseRoot, 'linux-work')
  const payloadRoot = join(workRoot, 'payload')

  await rm(workRoot, { recursive: true, force: true })
  await mkdir(payloadRoot, { recursive: true })
  await copyLinuxRuntime(payloadRoot)

  if (stageOnly) {
    console.log(`Staged SideTerm Bridge at ${payloadRoot}`)
    return { payloadRoot }
  }

  const debRoot = join(workRoot, 'deb-root')
  await cp(payloadRoot, debRoot, { recursive: true })
  await mkdir(join(debRoot, 'DEBIAN'), { recursive: true })
  await writeFile(
    join(debRoot, 'DEBIAN/control'),
    createDebianControl({ version, architecture: architecture.deb }),
    'utf8'
  )

  const debName = `SideTermBridge-${version}-linux-${architecture.asset}.deb`
  const debPath = join(releaseRoot, debName)
  run('dpkg-deb', ['--build', '--root-owner-group', debRoot, debPath])
  const stableDebPath = join(releaseRoot, `SideTermBridge-linux-${architecture.asset}.deb`)
  await copyFile(debPath, stableDebPath)

  const rpmRoot = join(workRoot, 'rpm')
  for (const directory of ['BUILD', 'BUILDROOT', 'RPMS', 'SOURCES', 'SPECS', 'SRPMS']) {
    await mkdir(join(rpmRoot, directory), { recursive: true })
  }
  const payloadArchive = join(rpmRoot, 'SOURCES/sideterm-payload.tar.gz')
  run('tar', ['-czf', payloadArchive, '-C', payloadRoot, '.'])
  const specPath = join(rpmRoot, 'SPECS/sideterm-bridge.spec')
  await writeFile(
    specPath,
    createRpmSpec({ version, architecture: architecture.rpm }),
    'utf8'
  )
  run('rpmbuild', ['--define', `_topdir ${rpmRoot}`, '-bb', specPath])

  const rpmName = `SideTermBridge-${version}-linux-${architecture.asset}.rpm`
  const builtRpm = join(
    rpmRoot,
    `RPMS/${architecture.rpm}/sideterm-bridge-${version}-1.${architecture.rpm}.rpm`
  )
  const rpmPath = join(releaseRoot, rpmName)
  await copyFile(builtRpm, rpmPath)
  const stableRpmPath = join(releaseRoot, `SideTermBridge-linux-${architecture.asset}.rpm`)
  await copyFile(rpmPath, stableRpmPath)

  const checksumPath = join(
    releaseRoot,
    `SideTermBridge-${version}-linux-${architecture.asset}-SHA256SUMS.txt`
  )
  await writeFile(
    checksumPath,
    `${await sha256(debPath)}  ${debName}\n${await sha256(rpmPath)}  ${rpmName}\n`,
    'utf8'
  )

  console.log(`Created ${debPath}`)
  console.log(`Created ${rpmPath}`)
  console.log(`Created ${checksumPath}`)
  return { payloadRoot, debPath, rpmPath, stableDebPath, stableRpmPath, checksumPath }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  packageLinux({ stageOnly: process.argv.includes('--stage-only') }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
