import '@tanstack/react-start/server-only'

import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client/node'

import * as schema from './schema.ts'

const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:dev.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})

export const db = drizzle(client, { schema })
