import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  ssr: {
    external: [
      '@libsql/client',
      '@libsql/client/node',
      '@libsql/client/web',
      'libsql',
      '@neon-rs/load',
      'detect-libc',
    ],
  },
  optimizeDeps: {
    exclude: [
      '@libsql/client',
      '@libsql/client/node',
      '@libsql/client/web',
      'libsql',
      '@neon-rs/load',
    ],
  },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: {
        external: [/^@sentry\//, /^@libsql\//],
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
