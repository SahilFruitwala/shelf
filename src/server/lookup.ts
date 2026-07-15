import { createServerFn } from '@tanstack/react-start'

import { requireUser } from './helpers'

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
  const res = await fetch(url, {
    redirect: 'follow',
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
      res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; ShelfBot/1.0; +https://shelf.app)',
          Accept: 'text/html',
        },
        redirect: 'follow',
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
