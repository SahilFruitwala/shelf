import '@tanstack/react-start/server-only'

import { drizzle } from 'drizzle-orm/libsql'

import * as schema from './schema.ts'

const url = process.env.DATABASE_URL ?? 'file:dev.db'

// Local dev uses a file (native client); production uses remote Turso over
// HTTP. The /web client has no native bindings — the right choice for Vercel's
// serverless runtime, where /node's native addon isn't bundled and crash-loops.
const { createClient } = url.startsWith('file:')
  ? await import('@libsql/client/node')
  : await import('@libsql/client/web')

const client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
})

export const db = drizzle(client, { schema })
