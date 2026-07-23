/**
 * One-time migration: move existing Better Auth users into Clerk and repoint
 * every foreign key from the old Better Auth user id to the new Clerk user id.
 *
 * Strategy (option A — import + password reset):
 *   1. Read every row from the local `user` table.
 *   2. Create (or find) a matching Clerk user by email. Passwords are NOT
 *      migrated — Better Auth's scrypt hashes aren't importable to Clerk — so
 *      users set a new password via "Forgot password" on first sign-in.
 *   3. Rewrite user.id and all referencing FK columns from old id -> Clerk id.
 *
 * Run this BEFORE `pnpm db:migrate` (which drops the account/session/
 * verification tables). It is idempotent per-user: a user whose id already
 * looks like a Clerk id (`user_…`) is skipped.
 *
 *   DATABASE_URL=… DATABASE_AUTH_TOKEN=… CLERK_SECRET_KEY=… \
 *     pnpm tsx scripts/migrate-to-clerk.ts
 *
 * Add DRY_RUN=1 to preview without writing anything.
 */
import { config } from 'dotenv'
import { createClient } from '@libsql/client/node'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { createClerkClient } from '@clerk/backend'

import * as schema from '../src/db/schema.ts'
import {
  activity,
  encryptedNotes,
  itemReactions,
  items,
  listMembers,
  lists,
  user,
  userVault,
} from '../src/db/schema.ts'

config({ path: ['.env.local', '.env'] })

const DRY_RUN = process.env.DRY_RUN === '1'

const secretKey = process.env.CLERK_SECRET_KEY
if (!secretKey) throw new Error('CLERK_SECRET_KEY is required')

const url = process.env.DATABASE_URL ?? 'file:dev.db'
const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN })
const db = drizzle(client, { schema })
const clerk = createClerkClient({ secretKey })

// Every column that references user.id, so we can repoint them all. `key` is
// the Drizzle property name used by `.set()`; `column` is used in the WHERE.
const FK_COLUMNS = [
  { table: lists, column: lists.ownerId, key: 'ownerId' },
  { table: listMembers, column: listMembers.userId, key: 'userId' },
  { table: items, column: items.addedBy, key: 'addedBy' },
  { table: activity, column: activity.userId, key: 'userId' },
  { table: itemReactions, column: itemReactions.userId, key: 'userId' },
  { table: userVault, column: userVault.userId, key: 'userId' },
  { table: encryptedNotes, column: encryptedNotes.userId, key: 'userId' },
] as const

/** Find an existing Clerk user by email, or create one (no password). */
async function ensureClerkUser(email: string, name: string, oldId: string) {
  const found = await clerk.users.getUserList({ emailAddress: [email] })
  if (found.data.length > 0) return found.data[0].id

  const [firstName, ...rest] = name.trim().split(/\s+/)
  const created = await clerk.users.createUser({
    emailAddress: [email],
    firstName: firstName || undefined,
    lastName: rest.join(' ') || undefined,
    externalId: oldId,
    skipPasswordRequirement: true,
    skipPasswordChecks: true,
  })
  return created.id
}

async function main() {
  const rows = await db.select().from(user)
  console.log(`Found ${rows.length} local user(s).`)

  for (const row of rows) {
    if (row.id.startsWith('user_')) {
      console.log(`  skip ${row.email} — already a Clerk id`)
      continue
    }
    if (!row.email) {
      console.warn(`  skip ${row.id} — no email, cannot migrate`)
      continue
    }

    const clerkId = DRY_RUN
      ? `user_DRYRUN_${row.id.slice(0, 6)}`
      : await ensureClerkUser(row.email, row.name, row.id)
    console.log(`  ${row.email}: ${row.id} -> ${clerkId}`)
    if (DRY_RUN) continue

    // Turn FK enforcement off so we can rename the primary key in place, then
    // repoint every referencing column. Updating the id (rather than
    // clone+delete) keeps the row's unique email from colliding with itself.
    await client.execute('PRAGMA foreign_keys=OFF')
    try {
      await db.update(user).set({ id: clerkId }).where(eq(user.id, row.id))
      for (const { table, column, key } of FK_COLUMNS) {
        await db
          .update(table)
          .set({ [key]: clerkId } as never)
          .where(eq(column, row.id))
      }
    } finally {
      await client.execute('PRAGMA foreign_keys=ON')
    }
  }

  console.log(DRY_RUN ? 'Dry run complete.' : 'Migration complete.')
  console.log(
    'Tell users to sign in with "Forgot password" — passwords were not migrated.',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
