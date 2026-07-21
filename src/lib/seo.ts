/**
 * Canonical origin for absolute URLs (Open Graph images, canonical tags).
 * Override per-environment with VITE_SITE_URL; falls back to the public domain.
 */
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL || 'https://shelf.app'
).replace(/\/$/, '')

export const SITE_NAME = 'Shelf'
const DEFAULT_DESCRIPTION = 'Things to try, watch, read, and visit.'
const DEFAULT_IMAGE = '/og.png'

type MetaTag =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }

interface SeoInput {
  title?: string
  description?: string
  /** Absolute or root-relative path of the OG image. */
  image?: string
  /** Root-relative path of the current page, e.g. "/privacy". */
  path?: string
  /** Keep the page out of search indexes. */
  noindex?: boolean
}

function absolute(pathOrUrl: string) {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl
  return `${SITE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}

/** Build the meta tags for a route's `head()`. */
export function seo(input: SeoInput = {}): MetaTag[] {
  const title = input.title ? `${input.title} · ${SITE_NAME}` : SITE_NAME
  const description = input.description ?? DEFAULT_DESCRIPTION
  const image = absolute(input.image ?? DEFAULT_IMAGE)
  const url = input.path ? absolute(input.path) : SITE_URL

  const tags: MetaTag[] = [
    { title },
    { name: 'description', content: description },

    // Open Graph
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:image', content: image },
    { property: 'og:url', content: url },

    // Twitter
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
  ]

  tags.push({
    name: 'robots',
    content: input.noindex ? 'noindex, nofollow' : 'index, follow',
  })

  return tags
}

/** Canonical link for a route's `head()`. */
export function canonical(path: string) {
  return { rel: 'canonical', href: absolute(path) }
}
