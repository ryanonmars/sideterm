import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputFile = resolve(repositoryRoot, 'dist/native/host.cjs')
const project = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
const bridgeVersion = process.env.SIDETERM_BRIDGE_VERSION || project.version

await mkdir(dirname(outputFile), { recursive: true })
await build({
  entryPoints: [resolve(repositoryRoot, 'src/native/index.ts')],
  outfile: outputFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['node-pty'],
  define: {
    'process.env.SIDETERM_BRIDGE_VERSION': JSON.stringify(bridgeVersion)
  },
  sourcemap: true
})
