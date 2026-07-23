/**
 * GDPR purge job: permanently delete users whose retention window has elapsed.
 *
 * Account deletion soft-deletes the local `user` row (sets `deletedAt` and
 * `purgeAfter`) and removes the Clerk user. This job runs on a schedule (cron)
 * and hard-deletes any row whose `purgeAfter` is in the past. FK cascades
 * (onDelete: 'cascade') remove the user's lists, items, notes, vault, etc.
 *
 *   DATABASE_URL=… DATABASE_AUTH_TOKEN=… pnpm tsx scripts/purge-deleted-users.ts
 *
 * Add DRY_RUN=1 to preview without writing anything.
 */
import { config } from 'dotenv'
import { createClient } from '@libsql/client/node'
import { drizzle } from 'drizzle-orm/libsql'
import { and, isNotNull, lte } from 'drizzle-orm'

import * as schema from '../src/db/schema.ts'
import { user } from '../src/db/schema.ts'

config({ path: ['.env.local', '.env'] })

const DRY_RUN = process.env.DRY_RUN === '1'

const url = process.env.DATABASE_URL ?? 'file:dev.db'
const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN })
const db = drizzle(client, { schema })

async function main() {
  const now = new Date()
  const due = await db
    .select({ id: user.id, email: user.email, purgeAfter: user.purgeAfter })
    .from(user)
    .where(and(isNotNull(user.purgeAfter), lte(user.purgeAfter, now)))

  console.log(`${due.length} account(s) past retention.`)
  for (const row of due) {
    console.log(`  purge ${row.email} (${row.id}) — due ${row.purgeAfter}`)
  }
  if (DRY_RUN) {
    console.log('Dry run — nothing deleted.')
    return
  }

  // Ensure cascades fire (libsql enforces FKs only when the pragma is on).
  await client.execute('PRAGMA foreign_keys=ON')
  // Single set-based delete covers all due rows; cascades remove owned data.
  await db
    .delete(user)
    .where(and(isNotNull(user.purgeAfter), lte(user.purgeAfter, now)))
  console.log('Purge complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
