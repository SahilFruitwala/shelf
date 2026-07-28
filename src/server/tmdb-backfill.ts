/**
 * TEMPORARY: fills in the TMDb link and poster for older movie/TV items that
 * were saved before we started storing them. The shelf view calls this once
 * per page of items; delete this file (and its caller in the list route) once
 * the library has been walked through.
 */
import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'

import { getDb } from './db-access'
import { requireMembership, requireUser } from './helpers'
import { items } from '#/db/schema'

/** Hard cap per call so one big shelf can't fire hundreds of TMDb requests. */
const MAX_PER_CALL = 20
/** TMDb allows ~50 req/s; three at a time with a pause is far below that. */
const CONCURRENCY = 3
const BATCH_PAUSE_MS = 150

/**
 * Items we already tried and couldn't match. Without this, a title TMDb has
 * never heard of would be re-searched on every single page view.
 */
const attempted = new Set<string>()

interface TmdbResult {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

async function searchTmdb(
  token: string,
  kind: 'movie' | 'tv',
  query: string,
  year?: string,
): Promise<Array<TmdbResult>> {
  const url = new URL(`https://api.themoviedb.org/3/search/${kind}`)
  url.searchParams.set('query', query)
  url.searchParams.set('include_adult', 'false')
  if (year)
    url.searchParams.set(kind === 'movie' ? 'year' : 'first_air_date_year', year)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return []
  const json = (await res.json()) as { results?: Array<TmdbResult> }
  return json.results ?? []
}

/**
 * Same matching rule as scripts/backfill-tmdb.ts: take an exact title match,
 * otherwise trust the top hit only when the year agrees, so we never stamp a
 * poster from the wrong film onto someone's shelf.
 */
async function resolve(
  token: string,
  kind: 'movie' | 'tv',
  title: string,
  year?: string,
) {
  let results = await searchTmdb(token, kind, title, year)
  if (results.length === 0 && year)
    results = await searchTmdb(token, kind, title)

  const exact = results.find(
    (r) => normalize((kind === 'movie' ? r.title : r.name) ?? '') === normalize(title),
  )
  const top = results[0]
  const topYear = (
    (kind === 'movie' ? top?.release_date : top?.first_air_date) ?? ''
  ).slice(0, 4)
  return exact ?? (top && (!year || topYear === year) ? top : undefined)
}

export const backfillTmdbArtwork = createServerFn({ method: 'POST' })
  .validator((data: { listId: string; itemIds: Array<string> }) => data)
  .handler(async ({ data }): Promise<{ updated: number }> => {
    const token = process.env.TMDB_API_TOKEN
    if (!token || data.itemIds.length === 0) return { updated: 0 }

    const db = await getDb()
    const me = await requireUser()
    await requireMembership(data.listId, me.id)

    const rows = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.listId, data.listId),
          inArray(items.id, data.itemIds.slice(0, MAX_PER_CALL * 4)),
        ),
      )

    const todo = rows
      .filter(
        (r) =>
          (r.type === 'movie' || r.type === 'tv') &&
          (!r.link?.trim() || !r.imageUrl?.trim()) &&
          !attempted.has(r.id),
      )
      .slice(0, MAX_PER_CALL)
    if (todo.length === 0) return { updated: 0 }

    let updated = 0
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      const batch = todo.slice(i, i + CONCURRENCY)
      await Promise.all(
        batch.map(async (item) => {
          attempted.add(item.id)
          const kind = item.type === 'movie' ? 'movie' : 'tv'
          // A stored tmdbId means we already know exactly which title it is.
          const tmdbId = item.metadata?.tmdbId?.trim()
          let poster: string | undefined
          let id = tmdbId

          if (!id) {
            const match = await resolve(
              token,
              kind,
              item.title,
              item.metadata?.year?.trim() || undefined,
            )
            if (!match) return
            id = String(match.id)
            poster = match.poster_path
              ? `https://image.tmdb.org/t/p/w342${match.poster_path}`
              : undefined
          } else if (!item.imageUrl?.trim()) {
            const res = await fetch(
              `https://api.themoviedb.org/3/${kind}/${id}`,
              { headers: { Authorization: `Bearer ${token}` } },
            )
            if (res.ok) {
              const detail = (await res.json()) as { poster_path?: string | null }
              poster = detail.poster_path
                ? `https://image.tmdb.org/t/p/w342${detail.poster_path}`
                : undefined
            }
          }

          const patch: Partial<typeof items.$inferInsert> = {}
          if (!item.link?.trim())
            patch.link = `https://www.themoviedb.org/${kind}/${id}`
          if (!item.imageUrl?.trim() && poster) patch.imageUrl = poster
          if (!tmdbId)
            patch.metadata = { ...item.metadata, tmdbId: id, tmdbKind: kind }
          if (Object.keys(patch).length === 0) return

          await db.update(items).set(patch).where(eq(items.id, item.id))
          updated++
        }),
      )
      if (i + CONCURRENCY < todo.length)
        await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS))
    }

    return { updated }
  })
