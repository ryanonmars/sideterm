import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const repositoryRoot = dirname(fileURLToPath(import.meta.url))
const extensionRoot = resolve(repositoryRoot, 'src/extension')

export default defineConfig({
  root: extensionRoot,
  publicDir: resolve(extensionRoot, 'public'),
  test: {
    root: repositoryRoot
  },
  build: {
    outDir: resolve(repositoryRoot, 'dist/extension'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: resolve(extensionRoot, 'panel.html'),
        background: resolve(extensionRoot, 'background.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
})
