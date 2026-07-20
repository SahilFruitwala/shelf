import '@tanstack/react-start/server-only'

import * as schema from './schema.ts'

const url = process.env.DATABASE_URL ?? 'file:dev.db'

// Local dev uses a file (native client); production uses remote Turso over
// HTTP. The /web client has no native bindings — the right choice for Vercel's
// serverless runtime, where /node's native addon isn't bundled and crash-loops.
// The drizzle entry must match: the bare `drizzle-orm/libsql` entry statically
// imports the native root `@libsql/client`, which doesn't exist on Vercel.
export const db = await (url.startsWith('file:')
  ? (async () => {
      const [{ drizzle }, { createClient }] = await Promise.all([
        import('drizzle-orm/libsql/node'),
        import('@libsql/client/node'),
      ])
      return drizzle(
        createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN }),
        { schema },
      )
    })()
  : (async () => {
      const [{ drizzle }, { createClient }] = await Promise.all([
        import('drizzle-orm/libsql/web'),
        import('@libsql/client/web'),
      ])
      return drizzle(
        createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN }),
        { schema },
      )
    })())
