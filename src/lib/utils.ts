import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

import type { ItemMetadata } from '#/db/schema'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const RELATIVE_STEPS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [60, 'second'],
  [60, 'minute'],
  [24, 'hour'],
  [7, 'day'],
  [4.35, 'week'],
  [12, 'month'],
  [Infinity, 'year'],
]

/** Case-insensitive, punctuation-stripped title for duplicate checks. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Great-circle distance in km between two lat/lng points. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Return the URL only if it's a safe http(s) link, else undefined. Guards
 * against stored XSS from `javascript:`/`data:` schemes rendered as hrefs.
 */
export function safeHttpUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return undefined
  }
  return parsed.toString()
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

export function itemCoords(
  metadata?: ItemMetadata | null,
): { lat: number; lng: number } | null {
  if (!metadata?.lat || !metadata.lng) return null
  const lat = Number(metadata.lat)
  const lng = Number(metadata.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/** Google Maps directions deep link for a lat/lng pin. */
export function mapsDirectionsUrl(
  lat: number,
  lng: number,
  label?: string,
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${lat},${lng}`,
  })
  if (label?.trim()) params.set('query', label.trim())
  return `https://www.google.com/maps/dir/?${params}`
}

/** Collect unique, sorted day/group labels from shelf items. */
export function existingDayGroups(
  items: Array<{ metadata?: ItemMetadata | null }>,
): Array<string> {
  const groups = new Set<string>()
  for (const item of items) {
    const g = item.metadata?.group?.trim()
    if (g) groups.add(g)
  }
  return [...groups].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}

export function timeAgo(date: Date | string | number): string {
  let delta = (new Date(date).getTime() - Date.now()) / 1000
  if (delta > -30) return 'just now'
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' })
  for (const [size, unit] of RELATIVE_STEPS) {
    if (Math.abs(delta) < size) return rtf.format(Math.round(delta), unit)
    delta /= size
  }
  return ''
}
