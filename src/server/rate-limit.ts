import { sql } from 'drizzle-orm'
import { getRequestIP } from '@tanstack/react-start/server'

import { rateLimits } from '#/db/schema'
import { getDb } from './db-access'

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

/**
 * Budgets for the outbound proxies. These are deliberately generous for a
 * human typing in a search box and stingy for a script: the point is to cap
 * the blast radius on metered upstreams (Places bills per call, TMDb will
 * revoke a token that hammers it), not to police normal use.
 */
export const RATE_LIMITS = {
  // Typeahead — fires per keystroke burst, so the ceiling is high.
  search: { limit: 60, windowMs: 60_000 },
  // Google Places bills per request; this is the one that costs real money.
  places: { limit: 20, windowMs: 60_000 },
  // Each call is a full page fetch against an arbitrary host.
  linkPreview: { limit: 20, windowMs: 60_000 },
  // Unauthenticated, so keyed by IP and held tighter than the rest.
  publicLookup: { limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>

export type RateLimitBucket = keyof typeof RATE_LIMITS

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super('Too many requests — give it a moment and try again.')
    this.name = 'RateLimitError'
  }
}

/**
 * Fixed-window counter, one round trip.
 *
 * The upsert does the whole decision in SQL: if the stored window has aged
 * out, the row resets to 1 and the window restarts; otherwise the count
 * increments. RETURNING hands back the post-increment count so we never need
 * a separate read — which matters, because the DB is ~55ms away and this runs
 * in front of calls that are already slow.
 */
export async function checkRateLimit(
  bucket: RateLimitBucket,
  subject: string,
): Promise<void> {
  const { limit, windowMs } = RATE_LIMITS[bucket]
  const db = await getDb()
  const nowSec = Math.floor(Date.now() / 1000)
  const windowSec = Math.ceil(windowMs / 1000)
  const cutoff = nowSec - windowSec
  const key = `${bucket}:${subject}`

  const rows = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: nowSec })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} <= ${cutoff} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} <= ${cutoff} then ${nowSec} else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart })

  const row = rows.at(0)
  if (!row || row.count <= limit) return

  const elapsed = nowSec - row.windowStart
  throw new RateLimitError(Math.max(windowSec - elapsed, 1))
}

/**
 * Caller identity for an unauthenticated endpoint. x-forwarded-for is only
 * trustworthy because we sit behind Vercel's proxy, which overwrites it.
 * Falls back to a single shared bucket when there's no IP to be had — a
 * coarse limit is still better than none.
 */
export function requestSubject(): string {
  return getRequestIP({ xForwardedFor: true }) ?? 'unknown'
}
