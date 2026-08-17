import { execFileSync } from 'node:child_process'
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Create the Chrome Web Store upload package. The public manifest may contain
 * a development-only key to keep unpacked testing tied to the native host;
 * Chrome Web Store packages must omit that field.
 */
export async function packageExtension({
  sourceRoot = resolve(repositoryRoot, 'dist/extension'),
  outputPath = resolve(repositoryRoot, 'release/SideTerm-extension.zip')
} = {}) {
  const sourceManifestPath = join(sourceRoot, 'manifest.json')
  await access(sourceManifestPath)

  const manifest = JSON.parse(await readFile(sourceManifestPath, 'utf8'))
  delete manifest.key

  const stagingRoot = await mkdtemp(join(os.tmpdir(), 'sideterm-extension-'))
  try {
    await cp(sourceRoot, stagingRoot, { recursive: true })
    await writeFile(join(stagingRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await mkdir(dirname(outputPath), { recursive: true })
    await rm(outputPath, { force: true })
    execFileSync('zip', ['-qr', outputPath, '.', '-x', '*.DS_Store'], {
      cwd: stagingRoot,
      stdio: 'inherit'
    })
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }

  console.log(`Created Chrome Web Store package at ${outputPath}`)
  return outputPath
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  packageExtension({
    outputPath: resolve(repositoryRoot, `release/SideTerm-extension-${JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8')).version}.zip`)
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
