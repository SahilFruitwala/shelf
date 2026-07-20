import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { createServerFn } from '@tanstack/react-start'

import { requireUser } from './helpers'

// ---------- SSRF guard for user-supplied URLs ----------

/** True for loopback, private, link-local, and other non-public IP ranges. */
function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) {
    const p = ip.split('.').map(Number)
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true
    const [a, b] = p
    return (
      a === 0 || // "this network"
      a === 10 || // private
      a === 127 || // loopback
      (a === 169 && b === 254) || // link-local (incl. cloud metadata 169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      a >= 224 // multicast / reserved
    )
  }
  if (kind === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fe80')) return true // link-local
    if (v.startsWith('fc') || v.startsWith('fd')) return true // unique-local
    // IPv4-mapped (::ffff:a.b.c.d) — check the embedded v4 address.
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    return false
  }
  return true // not a literal IP → treat as unsafe
}

/** Resolve a hostname and reject if it points at a private/internal address. */
async function assertPublicHost(hostname: string): Promise<void> {
  // Bracketed IPv6 literal or plain IP literal.
  const literal = hostname.replace(/^\[|\]$/g, '')
  if (isIP(literal)) {
    if (isPrivateIp(literal)) throw new Error('Blocked address')
    return
  }
  const records = await dnsLookup(hostname, { all: true })
  if (records.length === 0 || records.some((r) => isPrivateIp(r.address))) {
    throw new Error('Blocked address')
  }
}

/**
 * fetch() for untrusted URLs. Follows redirects manually, validating that every
 * hop is http(s) and resolves to a public IP — closing off SSRF to loopback,
 * private ranges, and cloud metadata endpoints.
 */
async function safeFetch(
  url: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<Response> {
  const { maxRedirects = 5, ...fetchInit } = init
  let current = url
  for (let i = 0; i <= maxRedirects; i++) {
    const parsed = new URL(current)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http(s) links are supported')
    }
    await assertPublicHost(parsed.hostname)

    const res = await fetch(current, { ...fetchInit, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return res
      current = new URL(location, current).toString()
      continue
    }
    return res
  }
  throw new Error('Too many redirects')
}

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
    await requireUser()
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
        .slice(0, 2)
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
  .validator((data: { tmdbId: string; kind: 'movie' | 'tv' }) => data)
  .handler(async ({ data }): Promise<Array<CountryWatch>> => {
    // No auth gate: this only proxies public TMDb availability data, so it can
    // also power the public read-only shelf page.
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
}

export const searchBooks = createServerFn({ method: 'GET' })
  .validator((query: string) => query)
  .handler(async ({ data: query }): Promise<Array<LookupResult>> => {
    await requireUser()

    const url = new URL('https://openlibrary.org/search.json')
    url.searchParams.set('q', query)
    url.searchParams.set('limit', '8')
    url.searchParams.set(
      'fields',
      'key,title,author_name,first_publish_year,cover_i',
    )

    const res = await fetch(url)
    if (!res.ok) return []
    const json = (await res.json()) as { docs?: Array<OpenLibraryDoc> }

    return (json.docs ?? []).map((d) => {
      const metadata: Record<string, string> = {}
      if (d.author_name?.length) metadata.author = d.author_name[0]
      if (d.first_publish_year) metadata.year = String(d.first_publish_year)
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
    await requireUser()
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

export const fetchLinkPreview = createServerFn({ method: 'GET' })
  .validator((url: string) => {
    const parsed = new URL(url) // throws on garbage
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http(s) links are supported')
    }
    return parsed.toString()
  })
  .handler(async ({ data: url }): Promise<LookupResult | null> => {
    await requireUser()

    let res: Response
    try {
      res = await safeFetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; ShelfBot/1.0; +https://shelf.app)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(8000),
      })
    } catch {
      return null
    }
    if (!res.ok) return null

    const html = (await res.text()).slice(0, 500_000)

    const title =
      extractMeta(html, 'og:title') ??
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()
    if (!title) return null

    const metadata: Record<string, string> = {}
    const description = extractMeta(html, 'og:description')
    if (description) metadata.description = description.slice(0, 300)
    const siteName = extractMeta(html, 'og:site_name')
    if (siteName) metadata.source = siteName

    return {
      title: decodeEntities(title),
      imageUrl: extractMeta(html, 'og:image'),
      link: url,
      metadata,
    }
  })
