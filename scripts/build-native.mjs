import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputFile = resolve(repositoryRoot, 'dist/native/host.cjs')

await mkdir(dirname(outputFile), { recursive: true })
await build({
  entryPoints: [resolve(repositoryRoot, 'src/native/index.ts')],
  outfile: outputFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['node-pty'],
  sourcemap: true
})
