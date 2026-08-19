import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

/**
 * Clerk Frontend API origins allowed by CSP. Development instances live on
 * `*.clerk.accounts.dev`. A custom production domain is optional and comes
 * from `CLERK_FRONTEND_API` (hostname or full https origin) so it never has
 * to be hardcoded in the repo.
 */
function clerkCspHosts(env: Record<string, string>): string {
  const hosts = new Set(['https://*.clerk.accounts.dev'])
  const extra = env.CLERK_FRONTEND_API?.trim()
  if (extra) {
    const origin = extra.replace(/\/$/, '')
    hosts.add(origin.startsWith('https://') ? origin : `https://${origin}`)
  }
  return [...hosts].join(' ')
}

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const clerkHosts = clerkCspHosts(env)

  /**
   * Content-Security-Policy, enforcing.
   *
   * If sign-in ever breaks after a Clerk upgrade, the fastest triage is to
   * rename the header below to `content-security-policy-report-only`, redeploy,
   * and read the violation reports in the browser console — that downgrades the
   * policy to advisory without removing the visibility.
   *
   * `img-src` is deliberately wide: item artwork is whatever `og:image` the link
   * preview found, so it can legitimately come from any https host.
   */
  const CSP = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // 'unsafe-inline' covers the inline theme script in __root.tsx and Clerk's
    // injected bootstrap. Tightening this to hashes means re-deriving them on
    // every Clerk upgrade, which is why it isn't done here.
    `script-src 'self' 'unsafe-inline' ${clerkHosts} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    // clerk-telemetry.com is non-essential, but blocking it only produces
    // console noise, so it's allowed rather than left to fail on every load.
    `connect-src 'self' ${clerkHosts} https://clerk-telemetry.com https://api.themoviedb.org`,
    `frame-src 'self' ${clerkHosts} https://challenges.cloudflare.com`,
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ')

  const SECURITY_HEADERS = {
    'content-security-policy': CSP,
    // Belt-and-braces with frame-ancestors, for anything that predates CSP.
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    // The app asks for none of these; deny them up front.
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  }

  return {
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
        routeRules: {
          '/**': { headers: SECURITY_HEADERS },
        },
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
  }
})

export default config
