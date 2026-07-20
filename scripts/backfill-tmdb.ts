/**
 * Backfills tmdbId, tmdbKind, and genre metadata on existing movie/TV items
 * by matching title (+year when present) against TMDb search.
 *
 *   pnpm tsx scripts/backfill-tmdb.ts          # dry run — shows what would change
 *   pnpm tsx scripts/backfill-tmdb.ts --write  # apply changes
 *
 * Safe to re-run — items that already have a tmdbId are skipped.
 */
import { config } from 'dotenv'
import { createClient } from '@libsql/client/node'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'

import * as schema from '../src/db/schema.ts'

config({ path: ['.env.local', '.env'] })

const write = process.argv.includes('--write')
const token = process.env.TMDB_API_TOKEN
if (!token) {
  console.error('TMDB_API_TOKEN is not set — add it to .env.local first.')
  process.exit(1)
}

const url = process.env.DATABASE_URL ?? 'file:dev.db'
const client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

// Same static maps as src/server/lookup.ts — TMDb genre ids are stable.
const MOVIE_GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
}
const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  10762: 'Kids',
  9648: 'Mystery',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
  37: 'Western',
}

interface TmdbResult {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  genre_ids?: Array<number>
}

async function searchTmdb(
  kind: 'movie' | 'tv',
  query: string,
  year?: string,
): Promise<Array<TmdbResult>> {
  const u = new URL(`https://api.themoviedb.org/3/search/${kind}`)
  u.searchParams.set('query', query)
  u.searchParams.set('include_adult', 'false')
  if (year)
    u.searchParams.set(kind === 'movie' ? 'year' : 'first_air_date_year', year)
  const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`TMDb search failed (${res.status})`)
  const json = (await res.json()) as { results?: Array<TmdbResult> }
  return json.results ?? []
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Genres straight from the title's TMDb detail page — exact, no guessing. */
async function fetchGenresById(
  kind: 'movie' | 'tv',
  tmdbId: string,
): Promise<Array<string>> {
  const res = await fetch(`https://api.themoviedb.org/3/${kind}/${tmdbId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  const json = (await res.json()) as { genres?: Array<{ name: string }> }
  // Detail pages spell some genres long-form; match the search-map naming.
  return (json.genres ?? [])
    .map((g) => (g.name === 'Science Fiction' ? 'Sci-Fi' : g.name))
    .slice(0, 2)
}

async function main() {
  const items = await db.query.items.findMany({
    where: inArray(schema.items.type, ['movie', 'tv']),
  })
  const todo = items.filter((i) => !i.metadata?.tmdbId?.trim())
  const genreTodo = items.filter(
    (i) => i.metadata?.tmdbId?.trim() && !i.metadata.genre?.trim(),
  )
  console.log(
    `${items.length} movie/TV items: ${todo.length} missing tmdbId, ${genreTodo.length} missing only genre${write ? '' : ' (dry run — pass --write to apply)'}\n`,
  )

  // Items that already have an id just need their genres looked up directly.
  for (const item of genreTodo) {
    const kind = item.metadata!.tmdbKind === 'tv' ? 'tv' : 'movie'
    const genres = await fetchGenresById(kind, item.metadata!.tmdbId!)
    if (genres.length === 0) {
      console.log(`  ? ${item.title} — TMDb lists no genres, left as-is`)
      continue
    }
    console.log(`  ✓ ${item.title} · ${genres.join(', ')}`)
    if (write) {
      await db
        .update(schema.items)
        .set({ metadata: { ...item.metadata, genre: genres.join(', ') } })
        .where(eq(schema.items.id, item.id))
    }
    await new Promise((r) => setTimeout(r, 120))
  }

  let matched = 0
  let skipped = 0
  for (const item of todo) {
    const kind = item.type === 'movie' ? 'movie' : 'tv'
    const year = item.metadata?.year?.trim()

    let results = await searchTmdb(kind, item.title, year)
    // A wrong stored year can blank the results — retry without it.
    if (results.length === 0 && year) results = await searchTmdb(kind, item.title)

    // Prefer an exact (normalized) title match; otherwise trust the top hit
    // only when the year also lines up, so we don't stamp the wrong film.
    const exact = results.find(
      (r) => normalize((kind === 'movie' ? r.title : r.name) ?? '') === normalize(item.title),
    )
    const top = results[0]
    const topYear = (
      (kind === 'movie' ? top?.release_date : top?.first_air_date) ?? ''
    ).slice(0, 4)
    const match = exact ?? (top && (!year || topYear === year) ? top : undefined)

    if (!match) {
      skipped++
      console.log(`  ? ${item.title} (${year ?? 'no year'}) — no confident match, left as-is`)
      continue
    }

    const genreMap = kind === 'movie' ? MOVIE_GENRES : TV_GENRES
    const genres = (match.genre_ids ?? [])
      .map((id) => genreMap[id])
      .filter(Boolean)
      .slice(0, 2)
    const matchYear = (
      (kind === 'movie' ? match.release_date : match.first_air_date) ?? ''
    ).slice(0, 4)

    const metadata: Record<string, string> = {
      ...item.metadata,
      tmdbId: String(match.id),
      tmdbKind: kind,
    }
    if (!metadata.genre?.trim() && genres.length > 0)
      metadata.genre = genres.join(', ')
    if (!metadata.year?.trim() && matchYear) metadata.year = matchYear

    matched++
    const label = (kind === 'movie' ? match.title : match.name) ?? '?'
    console.log(
      `  ✓ ${item.title} → ${label} (${matchYear}) [#${match.id}]${metadata.genre ? ` · ${metadata.genre}` : ''}`,
    )
    if (write) {
      await db
        .update(schema.items)
        .set({ metadata })
        .where(eq(schema.items.id, item.id))
    }

    // Stay well under TMDb's rate limits.
    await new Promise((r) => setTimeout(r, 120))
  }

  console.log(
    `\n${matched} matched${write ? ' and updated' : ''}, ${skipped} skipped, ${items.length - todo.length} already had tmdbId.`,
  )
}

main().then(() => process.exit(0))
