import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

/*
 * Env loading order matters here, and the obvious spelling of it is wrong.
 *
 * drizzle-kit preloads `.env` into process.env before it evaluates this file,
 * and dotenv will not overwrite a variable that is already set. So the
 * previous `config({ path: ['.env.local', '.env'] })` had no effect at all on
 * DATABASE_URL: `.env`'s production Turso URL was already in place and won,
 * even though `.env.local` sets `file:dev.db` and is meant to take precedence.
 *
 * The visible symptom was a bare `db:push` reporting "Changes applied" while
 * dev.db stayed untouched — because the changes were being applied to
 * production. Loading `.env` first and then `.env.local` with `override`
 * restores the intended precedence.
 */
// Captured before dotenv runs. Because drizzle-kit has already preloaded
// `.env`, this is *either* a genuinely explicit `DATABASE_URL=… pnpm db:push`
// or just `.env`'s own value — the two are told apart below by comparing
// against what `.env` actually contains.
const preloaded = process.env.DATABASE_URL

const fromEnv = config({ path: '.env', override: true }).parsed?.DATABASE_URL
const fromLocal = config({ path: '.env.local', override: true }).parsed
  ?.DATABASE_URL

// An explicitly exported URL (CI, a deliberate one-off) outranks both files.
const explicit =
  preloaded && preloaded !== fromEnv ? preloaded : undefined

// Otherwise `.env.local` wins over `.env`, which is the whole point — except
// under the explicit production opt-in, where `.env` (the remote URL) is
// exactly what's being asked for. Without this, `db:push:prod` would quietly
// target dev.db and look like a successful production push.
const optedIntoRemote = process.env.ALLOW_REMOTE_DB === '1'
const url =
  explicit ??
  (optedIntoRemote ? (fromEnv ?? fromLocal) : (fromLocal ?? fromEnv)) ??
  'file:dev.db'
process.env.DATABASE_URL = url
const isRemote = url.startsWith('libsql://') || url.startsWith('https://')

if (isRemote) {
  // Touching production should never be something you discover afterwards.
  console.warn(
    [
      '',
      '  ┌───────────────────────────────────────────────────────────┐',
      '  │  drizzle-kit is targeting the REMOTE (production) database │',
      '  └───────────────────────────────────────────────────────────┘',
      '',
    ].join('\n'),
  )
  if (process.env.ALLOW_REMOTE_DB !== '1') {
    throw new Error(
      'Refusing to run against production without an explicit opt-in.\n' +
        '  • local:      pnpm db:push        (uses .env.local → file:dev.db)\n' +
        '  • production: pnpm db:push:prod   (sets ALLOW_REMOTE_DB=1)\n',
    )
  }
}

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: isRemote ? 'turso' : 'sqlite',
  dbCredentials: isRemote
    ? { url, authToken: process.env.DATABASE_AUTH_TOKEN }
    : { url },
})
