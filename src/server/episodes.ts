import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'

import { items, watchedEpisodes } from '#/db/schema'
import { getDb } from './db-access'
import { newId, requireMembership, requireUser } from './helpers'

/** Loads the item, checks membership, and rejects anything that isn't a show. */
async function requireShow(itemId: string) {
  const db = await getDb()
  const me = await requireUser()
  const item = await db.query.items.findFirst({ where: eq(items.id, itemId) })
  if (!item) throw new Error('Item not found')
  if (item.type !== 'tv') throw new Error('Only shows have episodes')
  await requireMembership(item.listId, me.id)
  return { db, item }
}

export interface EpisodeRow {
  season: number
  number: number
  title: string
  airDate: string | null
  watched: boolean
}

export interface SeasonRow {
  season: number
  name: string
  episodeCount: number
  watchedCount: number
}

interface TmdbSeasonSummary {
  season_number: number
  name?: string
  episode_count?: number
}

interface TmdbEpisode {
  season_number: number
  episode_number: number
  name?: string
  air_date?: string | null
}

async function tmdb<T>(path: string): Promise<T | null> {
  const token = process.env.TMDB_API_TOKEN
  if (!token) return null
  const res = await fetch(`https://api.themoviedb.org/3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return (await res.json()) as T
}

/** Season list for a show's card, with locally-tracked progress folded in.
 *  Specials (season 0) are kept so the per-season counts still add up to the
 *  total shown on the card. */
export const getShowSeasons = createServerFn({ method: 'GET' })
  .validator((itemId: string) => itemId)
  .handler(async ({ data: itemId }) => {
    const { db, item } = await requireShow(itemId)

    const empty = {
      seasons: [] as Array<SeasonRow>,
      hasTmdb: false,
      watchedTotal: 0,
      unmatched: 0,
    }

    const tmdbId = String(item.metadata?.tmdbId ?? '').trim()
    if (!tmdbId) return empty

    const show = await tmdb<{ seasons?: Array<TmdbSeasonSummary> }>(
      `tv/${tmdbId}`,
    )
    if (!show?.seasons) return empty

    const watched = await db
      .select({ season: watchedEpisodes.season })
      .from(watchedEpisodes)
      .where(eq(watchedEpisodes.itemId, itemId))

    const watchedBySeason = new Map<number, number>()
    for (const w of watched)
      watchedBySeason.set(w.season, (watchedBySeason.get(w.season) ?? 0) + 1)

    const seasons: Array<SeasonRow> = show.seasons.map((s) => ({
      season: s.season_number,
      name: s.name?.trim() || `Season ${s.season_number}`,
      episodeCount: s.episode_count ?? 0,
      watchedCount: watchedBySeason.get(s.season_number) ?? 0,
    }))

    // Imported history can use season numbers TMDb doesn't have (Trakt and
    // TMDb disagree on how some long-running shows are split). Surface the
    // leftovers rather than silently dropping them from the totals.
    const placed = seasons.reduce((n, s) => n + s.watchedCount, 0)
    return {
      seasons,
      hasTmdb: true,
      watchedTotal: watched.length,
      unmatched: watched.length - placed,
    }
  })

/** Episodes of one season, each flagged with whether it's ticked off. */
export const getSeasonEpisodes = createServerFn({ method: 'GET' })
  .validator((data: { itemId: string; season: number }) => data)
  .handler(async ({ data }): Promise<Array<EpisodeRow>> => {
    const { db, item } = await requireShow(data.itemId)

    const tmdbId = String(item.metadata?.tmdbId ?? '').trim()
    if (!tmdbId) return []

    const [season, watched] = await Promise.all([
      tmdb<{ episodes?: Array<TmdbEpisode> }>(
        `tv/${tmdbId}/season/${data.season}`,
      ),
      db
        .select({ number: watchedEpisodes.number })
        .from(watchedEpisodes)
        .where(
          and(
            eq(watchedEpisodes.itemId, data.itemId),
            eq(watchedEpisodes.season, data.season),
          ),
        ),
    ])
    if (!season?.episodes) return []

    const seen = new Set(watched.map((w) => w.number))
    return season.episodes.map((e) => ({
      season: e.season_number,
      number: e.episode_number,
      title: e.name?.trim() || `Episode ${e.episode_number}`,
      airDate: e.air_date ?? null,
      watched: seen.has(e.episode_number),
    }))
  })

/** Recomputes the rolled-up counters the card shows, after any change. */
async function syncShowProgress(itemId: string) {
  const db = await getDb()
  const rows = await db
    .select({ season: watchedEpisodes.season, number: watchedEpisodes.number })
    .from(watchedEpisodes)
    .where(eq(watchedEpisodes.itemId, itemId))

  const item = await db.query.items.findFirst({ where: eq(items.id, itemId) })
  if (!item) return

  // Highest season, then highest episode within it — the furthest you've got.
  const last = rows.reduce<{ season: number; number: number } | null>(
    (acc, r) =>
      !acc ||
      r.season > acc.season ||
      (r.season === acc.season && r.number > acc.number)
        ? r
        : acc,
    null,
  )

  const metadata = { ...item.metadata }
  if (rows.length > 0) {
    metadata.episodesWatched = String(rows.length)
    if (last) metadata.lastEpisode = `S${last.season}E${last.number}`
  } else {
    delete metadata.episodesWatched
    delete metadata.lastEpisode
  }

  await db.update(items).set({ metadata }).where(eq(items.id, itemId))
}

/** Tick or clear every episode across every season — backs "mark whole show
 *  watched" on the item card. */
export const setShowWatched = createServerFn({ method: 'POST' })
  .validator((data: { itemId: string; watched: boolean }) => data)
  .handler(async ({ data }) => {
    const { db, item } = await requireShow(data.itemId)

    if (!data.watched) {
      await db
        .delete(watchedEpisodes)
        .where(eq(watchedEpisodes.itemId, data.itemId))
      await syncShowProgress(data.itemId)
      return
    }

    const tmdbId = String(item.metadata?.tmdbId ?? '').trim()
    if (!tmdbId) return

    const show = await tmdb<{ seasons?: Array<TmdbSeasonSummary> }>(
      `tv/${tmdbId}`,
    )
    if (!show?.seasons) return

    const seasonEpisodes = await Promise.all(
      show.seasons.map((s) =>
        tmdb<{ episodes?: Array<TmdbEpisode> }>(
          `tv/${tmdbId}/season/${s.season_number}`,
        ),
      ),
    )

    const existing = await db
      .select({ season: watchedEpisodes.season, number: watchedEpisodes.number })
      .from(watchedEpisodes)
      .where(eq(watchedEpisodes.itemId, data.itemId))
    const seen = new Set(existing.map((e) => `${e.season}:${e.number}`))

    const toInsert: Array<typeof watchedEpisodes.$inferInsert> = []
    show.seasons.forEach((s, i) => {
      for (const e of seasonEpisodes[i]?.episodes ?? []) {
        const key = `${s.season_number}:${e.episode_number}`
        if (seen.has(key)) continue
        seen.add(key)
        toInsert.push({
          id: newId(),
          itemId: data.itemId,
          season: s.season_number,
          number: e.episode_number,
          watchedAt: new Date(),
        })
      }
    })

    if (toInsert.length > 0) await db.insert(watchedEpisodes).values(toInsert)
    await syncShowProgress(data.itemId)
  })

export const toggleEpisode = createServerFn({ method: 'POST' })
  .validator((data: { itemId: string; season: number; number: number }) => data)
  .handler(async ({ data }) => {
    const { db } = await requireShow(data.itemId)

    const existing = await db.query.watchedEpisodes.findFirst({
      where: and(
        eq(watchedEpisodes.itemId, data.itemId),
        eq(watchedEpisodes.season, data.season),
        eq(watchedEpisodes.number, data.number),
      ),
    })

    if (existing) {
      await db
        .delete(watchedEpisodes)
        .where(eq(watchedEpisodes.id, existing.id))
    } else {
      await db.insert(watchedEpisodes).values({
        id: newId(),
        itemId: data.itemId,
        season: data.season,
        number: data.number,
        watchedAt: new Date(),
      })
    }

    await syncShowProgress(data.itemId)
    return { watched: !existing }
  })

/** Tick or clear a whole season at once. */
export const setSeasonWatched = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      itemId: string
      season: number
      numbers: Array<number>
      watched: boolean
    }) => data,
  )
  .handler(async ({ data }) => {
    const { db } = await requireShow(data.itemId)
    if (data.numbers.length === 0) return

    if (data.watched) {
      const existing = await db
        .select({ number: watchedEpisodes.number })
        .from(watchedEpisodes)
        .where(
          and(
            eq(watchedEpisodes.itemId, data.itemId),
            eq(watchedEpisodes.season, data.season),
          ),
        )
      const seen = new Set(existing.map((e) => e.number))
      const missing = data.numbers.filter((n) => !seen.has(n))
      if (missing.length > 0) {
        await db.insert(watchedEpisodes).values(
          missing.map((number) => ({
            id: newId(),
            itemId: data.itemId,
            season: data.season,
            number,
            watchedAt: new Date(),
          })),
        )
      }
    } else {
      await db
        .delete(watchedEpisodes)
        .where(
          and(
            eq(watchedEpisodes.itemId, data.itemId),
            eq(watchedEpisodes.season, data.season),
            inArray(watchedEpisodes.number, data.numbers),
          ),
        )
    }

    await syncShowProgress(data.itemId)
  })
