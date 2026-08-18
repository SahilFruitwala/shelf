import { createServerFn } from '@tanstack/react-start'

import { getAuthUser } from './db-access'
import { assertLiveViewCode, requireUser } from './helpers'
import { checkRateLimit, requestSubject } from './rate-limit'
import { safeFetch } from './safe-fetch'

export interface LookupResult {
  title: string
  imageUrl?: string
  link?: string
  metadata: Record<string, string>
}

// ---------- Movies & TV via TMDb ----------

interface TmdbResult {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  overview?: string
  genre_ids?: Array<number>
}

// TMDb genre ids are stable, so a static map beats an extra API round-trip.
const TMDB_MOVIE_GENRES: Record<number, string> = {
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

const TMDB_TV_GENRES: Record<number, string> = {
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

export const searchTmdb = createServerFn({ method: 'GET' })
  .validator((data: { query: string; kind: 'movie' | 'tv' }) => data)
  .handler(async ({ data }): Promise<Array<LookupResult>> => {
    const me = await requireUser()
    await checkRateLimit('search', me.id)
    const token = process.env.TMDB_API_TOKEN
    if (!token) return []

    const url = new URL(`https://api.themoviedb.org/3/search/${data.kind}`)
    url.searchParams.set('query', data.query)
    url.searchParams.set('include_adult', 'false')

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []
    const json = (await res.json()) as { results?: Array<TmdbResult> }

    return (json.results ?? []).slice(0, 8).map((r) => {
      const title = (data.kind === 'movie' ? r.title : r.name) ?? 'Untitled'
      const date = data.kind === 'movie' ? r.release_date : r.first_air_date
      const metadata: Record<string, string> = {}
      if (date) metadata.year = date.slice(0, 4)
      if (r.overview) metadata.overview = r.overview.slice(0, 300)
      const genreMap =
        data.kind === 'movie' ? TMDB_MOVIE_GENRES : TMDB_TV_GENRES
      const genres = (r.genre_ids ?? [])
        .map((id) => genreMap[id])
        .filter(Boolean)
        .slice(0, 3)
      if (genres.length > 0) metadata.genre = genres.join(', ')
      // Kept so we can fetch streaming availability once the user picks this one.
      metadata.tmdbId = String(r.id)
      metadata.tmdbKind = data.kind
      return {
        title,
        imageUrl: r.poster_path
          ? `https://image.tmdb.org/t/p/w342${r.poster_path}`
          : undefined,
        link: `https://www.themoviedb.org/${data.kind}/${r.id}`,
        metadata,
      }
    })
  })

// ---------- "Where to watch" via TMDb watch providers (JustWatch data) ----------

interface TmdbProvider {
  provider_name: string
  logo_path?: string | null
  display_priority?: number
}

/** One watchable service: display name plus a small square logo. */
export interface WatchProvider {
  name: string
  /** Full image URL for the provider logo, when TMDb has one. */
  logo?: string
}

interface TmdbWatchRegion {
  link?: string
  flatrate?: Array<TmdbProvider>
  free?: Array<TmdbProvider>
  ads?: Array<TmdbProvider>
  rent?: Array<TmdbProvider>
  buy?: Array<TmdbProvider>
}

/** Where a title can be watched in one country. */
export interface CountryWatch {
  /** ISO 3166-1 country code, e.g. "US", "IN". */
  code: string
  /** Localized country name, e.g. "United States". */
  name: string
  /** Streaming/subscription services, most relevant first. */
  streaming: Array<WatchProvider>
  /** Rent/buy-only services when nothing streams it. */
  rent: Array<WatchProvider>
  /** JustWatch deep link for this country (all options). */
  link?: string
}

const regionNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

/**
 * JustWatch lists resale channels and ad tiers as separate providers
 * ("Lionsgate Play Amazon Channel", "Netflix with Ads"…). Collapse them
 * down to the parent service name so the list is scannable.
 */
function canonicalName(name: string): string {
  return name
    .replace(/\s+(Apple TV|Amazon|Roku Premium)\s+Channel$/i, '')
    .replace(/\s+with Ads$/i, '')
    .replace(/\s+(Basic|Standard|Premium)$/i, '')
    .trim()
}

function dedupeByPriority(
  lists: Array<Array<TmdbProvider>>,
): Array<WatchProvider> {
  const seen = new Set<string>()
  const out: Array<WatchProvider> = []
  for (const list of lists) {
    for (const p of [...list].sort(
      (a, b) => (a.display_priority ?? 0) - (b.display_priority ?? 0),
    )) {
      const name = canonicalName(p.provider_name)
      if (!seen.has(name)) {
        seen.add(name)
        out.push({
          name,
          logo: p.logo_path
            ? `https://image.tmdb.org/t/p/w92${p.logo_path}`
            : undefined,
        })
      }
    }
  }
  return out
}

/** Availability per country for a movie/TV title, sorted by country name. */
export const fetchWatchProviders = createServerFn({ method: 'GET' })
  .validator(
    (data: { tmdbId: string; kind: 'movie' | 'tv'; viewCode?: string }) => data,
  )
  .handler(async ({ data }): Promise<Array<CountryWatch>> => {
    // The data is public TMDb availability, but the *call* spends our TMDb
    // token — so it still needs a caller. Either a signed-in user, or someone
    // holding a live view code (which is how the public shelf page reaches
    // it). Anonymous callers are keyed by IP and held to a tighter budget.
    const me = await getAuthUser()
    if (me) {
      await checkRateLimit('search', me.id)
    } else {
      if (!data.viewCode) throw new Error('Not signed in')
      await assertLiveViewCode(data.viewCode)
      await checkRateLimit('publicLookup', requestSubject())
    }

    const token = process.env.TMDB_API_TOKEN
    if (!token) return []

    const res = await fetch(
      `https://api.themoviedb.org/3/${data.kind}/${data.tmdbId}/watch/providers`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return []
    const json = (await res.json()) as {
      results?: Record<string, TmdbWatchRegion>
    }
    const results = json.results ?? {}

    const countries: Array<CountryWatch> = []
    for (const [code, r] of Object.entries(results)) {
      // Streaming/free/ad-supported all count as "you can just watch it".
      const streaming = dedupeByPriority([
        r.flatrate ?? [],
        r.free ?? [],
        r.ads ?? [],
      ]).slice(0, 8)
      const rent = dedupeByPriority([r.rent ?? [], r.buy ?? []]).slice(0, 8)
      if (streaming.length === 0 && rent.length === 0) continue
      countries.push({
        code,
        name: regionNames?.of(code) ?? code,
        streaming,
        rent,
        link: r.link,
      })
    }

    countries.sort((a, b) => a.name.localeCompare(b.name))
    return countries
  })

// ---------- Books via Open Library ----------

interface OpenLibraryDoc {
  key: string
  title: string
  author_name?: Array<string>
  first_publish_year?: number
  cover_i?: number
  subject?: Array<string>
  first_sentence?: string | Array<string> | { value?: string }
}

const SKIP_BOOK_SUBJECTS =
  /^(accessible book|protected daisy|in library|overdrive|nyt[:.]|large type|open library|internet archive)/i

function bookBlurb(
  value: OpenLibraryDoc['first_sentence'],
): string | undefined {
  const raw = Array.isArray(value)
    ? value[0]
    : typeof value === 'object' && value
      ? value.value
      : value
  const text = raw?.trim()
  if (!text) return undefined
  return text.slice(0, 300)
}

function bookGenres(subjects: Array<string> | undefined): string | undefined {
  if (!subjects?.length) return undefined
  const picked = subjects
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length <= 32 && !SKIP_BOOK_SUBJECTS.test(s))
    .slice(0, 3)
  return picked.length > 0 ? picked.join(', ') : undefined
}

export const searchBooks = createServerFn({ method: 'GET' })
  .validator((query: string) => query)
  .handler(async ({ data: query }): Promise<Array<LookupResult>> => {
    const me = await requireUser()
    await checkRateLimit('search', me.id)

    const url = new URL('https://openlibrary.org/search.json')
    url.searchParams.set('q', query)
    url.searchParams.set('limit', '8')
    url.searchParams.set(
      'fields',
      'key,title,author_name,first_publish_year,cover_i,subject,first_sentence',
    )

    const res = await fetch(url)
    if (!res.ok) return []
    const json = (await res.json()) as { docs?: Array<OpenLibraryDoc> }

    return (json.docs ?? []).map((d) => {
      const metadata: Record<string, string> = {}
      if (d.author_name?.length) metadata.author = d.author_name[0]
      if (d.first_publish_year) metadata.year = String(d.first_publish_year)
      const genre = bookGenres(d.subject)
      if (genre) metadata.genre = genre
      const overview = bookBlurb(d.first_sentence)
      if (overview) metadata.overview = overview
      return {
        title: d.title,
        imageUrl: d.cover_i
          ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
          : undefined,
        link: `https://openlibrary.org${d.key}`,
        metadata,
      }
    })
  })

// ---------- Exercises via free-exercise-db (public domain) ----------

const EXERCISE_DB_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const EXERCISE_IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

interface FreeExercise {
  id: string
  name: string
  force?: string | null
  level?: string | null
  mechanic?: string | null
  equipment?: string | null
  category?: string | null
  primaryMuscles?: Array<string>
  secondaryMuscles?: Array<string>
  instructions?: Array<string>
  images?: Array<string>
}

let exerciseCache: Array<FreeExercise> | null = null
let exerciseCachePromise: Promise<Array<FreeExercise>> | null = null

async function loadExercises(): Promise<Array<FreeExercise>> {
  if (exerciseCache) return exerciseCache
  if (!exerciseCachePromise) {
    exerciseCachePromise = fetch(EXERCISE_DB_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error('Exercise lookup failed')
        const data = (await res.json()) as Array<FreeExercise>
        exerciseCache = data
        return data
      })
      .catch((err) => {
        exerciseCachePromise = null
        throw err
      })
  }
  return exerciseCachePromise
}

function titleCaseWords(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Full exercise detail for the browse/how-to page (not shelf items). */
export interface ExerciseDetail {
  id: string
  name: string
  force?: string
  level?: string
  mechanic?: string
  equipment?: string
  category?: string
  primaryMuscles: Array<string>
  secondaryMuscles: Array<string>
  instructions: Array<string>
  images: Array<string>
}

function toExerciseDetail(ex: FreeExercise): ExerciseDetail {
  return {
    id: ex.id,
    name: ex.name,
    force: ex.force ? titleCaseWords(ex.force) : undefined,
    level: ex.level ? titleCaseWords(ex.level) : undefined,
    mechanic: ex.mechanic ? titleCaseWords(ex.mechanic) : undefined,
    equipment: ex.equipment ? titleCaseWords(ex.equipment) : undefined,
    category: ex.category ? titleCaseWords(ex.category) : undefined,
    primaryMuscles: (ex.primaryMuscles ?? []).map(titleCaseWords),
    secondaryMuscles: (ex.secondaryMuscles ?? []).map(titleCaseWords),
    instructions: ex.instructions ?? [],
    images: (ex.images ?? []).map((path) => EXERCISE_IMAGE_BASE + path),
  }
}

/** Browse-only search — returns full how-to details, no shelf coupling. */
export const browseExercises = createServerFn({ method: 'GET' })
  .validator((query: string) => query)
  .handler(async ({ data: query }): Promise<Array<ExerciseDetail>> => {
    await requireUser()

    const q = query.trim().toLowerCase()
    if (q.length < 2) return []

    const exercises = await loadExercises()
    const scored: Array<{ score: number; ex: FreeExercise }> = []
    for (const ex of exercises) {
      const name = ex.name.toLowerCase()
      if (!name.includes(q)) continue
      const score =
        (name.startsWith(q) ? 0 : 1) * 1000 +
        name.indexOf(q) * 10 +
        name.length
      scored.push({ score, ex })
    }

    scored.sort((a, b) => a.score - b.score)
    return scored.slice(0, 12).map(({ ex }) => toExerciseDetail(ex))
  })

// ---------- Restaurants & places via Google Places API (New) ----------

interface GooglePlace {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  primaryTypeDisplayName?: { text?: string }
  googleMapsLinks?: { placeUri?: string }
}

const PLACES_FIELD_MASK =
  'places.id,places.displayName,places.primaryTypeDisplayName,places.location,places.formattedAddress,places.priceLevel,places.rating,places.userRatingCount,places.googleMapsLinks'

const PRICE_LEVELS: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
}

function placeToResult(place: GooglePlace): LookupResult {
  const metadata: Record<string, string> = {}
  if (place.formattedAddress) metadata.address = place.formattedAddress
  if (place.rating) {
    metadata.rating = place.userRatingCount
      ? `${place.rating} (${place.userRatingCount})`
      : String(place.rating)
  }
  if (place.priceLevel && PRICE_LEVELS[place.priceLevel])
    metadata.price = PRICE_LEVELS[place.priceLevel]
  if (place.primaryTypeDisplayName?.text)
    metadata.kind = place.primaryTypeDisplayName.text
  const location = place.location
  if (location?.latitude != null && location.longitude != null) {
    metadata.lat = String(location.latitude)
    metadata.lng = String(location.longitude)
  }
  return {
    title: place.displayName?.text ?? 'Unnamed place',
    link:
      place.googleMapsLinks?.placeUri ??
      `https://www.google.com/maps/place/?q=place_id:${place.id}`,
    metadata,
  }
}

async function resolveMapsUrl(
  url: string,
  apiKey: string,
): Promise<Array<LookupResult>> {
  // Follow redirects (short links → full google.com/maps URL), pull the pin
  // coordinates out, then nearby-search a tight radius to land on the place.
  const res = await safeFetch(url, {
    signal: AbortSignal.timeout(8000),
  })
  const fullUrl = decodeURIComponent(res.url)
  const markerMatch = fullUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  const atMatch = fullUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  const coords = markerMatch ?? atMatch
  if (!coords) return []

  const searchRes = await fetch(
    'https://places.googleapis.com/v1/places:searchNearby',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        maxResultCount: 1,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: {
            center: {
              latitude: Number(coords[1]),
              longitude: Number(coords[2]),
            },
            radius: 50,
          },
        },
      }),
    },
  )
  if (!searchRes.ok)
    throw new Error(`Place lookup failed (${searchRes.status})`)
  const data = (await searchRes.json()) as { places?: Array<GooglePlace> }
  return (data.places ?? []).map((place) => {
    const result = placeToResult(place)
    // Fall back to the pin we pulled from the URL if the API omits location.
    if (!('lat' in result.metadata)) {
      result.metadata.lat = coords[1]
      result.metadata.lng = coords[2]
    }
    return result
  })
}

// Google Maps links, including maps.app.goo.gl short links. Not anchored to the
// start of the string: iOS share sheets prepend the place name/description
// (e.g. "Blue Bottle Coffee\nhttps://maps.app.goo.gl/…"), so we pull the first
// maps URL out of wherever it lands in the pasted text.
const MAPS_URL_IN_TEXT_RE =
  /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.[a-z.]+|(?:www\.)?google\.[a-z.]+\/maps)\/\S*/i

function extractMapsUrl(text: string): string | null {
  return text.match(MAPS_URL_IN_TEXT_RE)?.[0] ?? null
}

export const searchPlaces = createServerFn({ method: 'GET' })
  .validator((data: { query: string; kind: 'restaurant' | 'place' }) => data)
  .handler(async ({ data }): Promise<Array<LookupResult>> => {
    const me = await requireUser()
    await checkRateLimit('places', me.id)
    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    if (!apiKey) throw new Error('Place lookup is not configured')

    const query = data.query.trim()

    // A pasted Google Maps link resolves to the exact pinned place. The URL may
    // be embedded in share text (iOS prepends the place name), so extract it.
    const mapsUrl = extractMapsUrl(query)
    if (mapsUrl) {
      return await resolveMapsUrl(mapsUrl, apiKey)
    }

    const body: { textQuery: string; includedType?: string } = {
      textQuery: query,
    }
    if (data.kind === 'restaurant') body.includedType = 'restaurant'

    const res = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': PLACES_FIELD_MASK,
        },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) throw new Error(`Place search failed (${res.status})`)
    const json = (await res.json()) as { places?: Array<GooglePlace> }
    return (json.places ?? []).slice(0, 8).map(placeToResult)
  })

// ---------- Anything with a URL via Open Graph ----------

function extractMeta(html: string, property: string): string | undefined {
  // Matches <meta property="og:x" content="..."> with attributes in either order.
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    ),
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m?.[1]) return decodeEntities(m[1].trim())
  }
  return undefined
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
}

// A real browser User-Agent (plus friends). Retailers like Amazon serve a
// robot/CAPTCHA page — stripped of OG tags — to anything that looks like a bot,
// so we ask for the page the way a browser would.
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

/** Amazon rarely exposes OG tags; pull title/image straight from its DOM. */
function amazonFallback(html: string): { title?: string; imageUrl?: string } {
  const title = html
    .match(/<span[^>]+id=["']productTitle["'][^>]*>([^<]+)<\/span>/i)?.[1]
    ?.trim()

  // The main image carries a full-res URL in data-old-hires, or a JSON map of
  // srcset-style URLs in data-a-dynamic-image (first key is the largest).
  let imageUrl = html.match(
    /id=["']landingImage["'][^>]*\bdata-old-hires=["']([^"']+)["']/i,
  )?.[1]
  if (!imageUrl) {
    const dynamic = html.match(
      /id=["']landingImage["'][^>]*\bdata-a-dynamic-image=["']([^"']+)["']/i,
    )?.[1]
    if (dynamic) {
      // The attribute is HTML-encoded JSON: {"https://...jpg":[500,500],...}
      imageUrl = decodeEntities(dynamic).match(/"(https?:\/\/[^"]+)"/)?.[1]
    }
  }

  return { title: title ? decodeEntities(title) : undefined, imageUrl }
}

export const fetchLinkPreview = createServerFn({ method: 'GET' })
  .validator((url: string) => {
    const parsed = new URL(url) // throws on garbage
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http(s) links are supported')
    }
    return parsed.toString()
  })
  .handler(async ({ data: url }): Promise<LookupResult | null> => {
    const me = await requireUser()
    await checkRateLimit('linkPreview', me.id)

    let res: Response
    try {
      res = await safeFetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8000),
      })
    } catch {
      return null
    }
    if (!res.ok) return null

    const html = (await res.text()).slice(0, 500_000)

    let title =
      extractMeta(html, 'og:title') ??
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()
    let imageUrl = extractMeta(html, 'og:image')

    // Amazon (and lookalikes) often ship no usable OG tags — read their DOM.
    if ((!title || !imageUrl) && /(^|\.)amazon\./i.test(new URL(url).hostname)) {
      const fallback = amazonFallback(html)
      title = title ?? fallback.title
      imageUrl = imageUrl ?? fallback.imageUrl
    }

    if (!title) return null

    const metadata: Record<string, string> = {}
    const description = extractMeta(html, 'og:description')
    if (description) metadata.description = description.slice(0, 300)
    const siteName = extractMeta(html, 'og:site_name')
    if (siteName) metadata.source = siteName

    return {
      title: decodeEntities(title),
      imageUrl,
      link: url,
      metadata,
    }
  })
