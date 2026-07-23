import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Allow the dev server to be reached through an ngrok tunnel (for testing
  // inbound webhooks). Vite otherwise 403s any Host it doesn't recognise.
  server: {
    allowedHosts: ['.ngrok-free.app', '.ngrok.app'],
  },
  ssr: {
    // Only the native-binding packages stay external. @libsql/client/web is
    // pure JS and must be bundled — Vercel's function has no node_modules.
    external: [
      '@libsql/client',
      '@libsql/client/node',
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
        // The node/native driver branch stays external so its static
        // `@libsql/client/node` import can't get hoisted into a shared chunk
        // that Vercel loads eagerly. It's only dynamic-imported when
        // DATABASE_URL is file:, which never happens in production.
        external: [
          /^@sentry\//,
          '@libsql/client',
          '@libsql/client/node',
          'libsql',
          'drizzle-orm/libsql/node',
        ],
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
