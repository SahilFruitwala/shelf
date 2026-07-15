import {
  Book,
  Clapperboard,
  Compass,
  Gift,
  Layers,
  MapPin,
  Tv,
  UtensilsCrossed,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ItemStatus, ItemType, ListType } from '#/db/schema'

export type LookupMode =
  'tmdb-movie' | 'tmdb-tv' | 'books' | 'places-restaurant' | 'places' | 'url'

interface CategoryConfig {
  label: string
  itemNoun: string
  icon: LucideIcon
  /** Tailwind text-* class for the category accent */
  textClass: string
  /** Tailwind bg-* class for the category accent */
  bgClass: string
  toTryLabel: string
  doneLabel: string
  lookup: LookupMode
  lookupHint: string
}

export const CATEGORIES: Record<ItemType, CategoryConfig> = {
  restaurant: {
    label: 'Restaurants',
    itemNoun: 'restaurant',
    icon: UtensilsCrossed,
    textClass: 'text-cat-restaurant',
    bgClass: 'bg-cat-restaurant',
    toTryLabel: 'To try',
    doneLabel: 'Tried',
    lookup: 'places-restaurant',
    lookupHint: 'Search or paste a Google Maps link',
  },
  movie: {
    label: 'Movies',
    itemNoun: 'movie',
    icon: Clapperboard,
    textClass: 'text-cat-movie',
    bgClass: 'bg-cat-movie',
    toTryLabel: 'To watch',
    doneLabel: 'Watched',
    lookup: 'tmdb-movie',
    lookupHint: 'Search by title',
  },
  tv: {
    label: 'TV series',
    itemNoun: 'series',
    icon: Tv,
    textClass: 'text-cat-tv',
    bgClass: 'bg-cat-tv',
    toTryLabel: 'To watch',
    doneLabel: 'Watched',
    lookup: 'tmdb-tv',
    lookupHint: 'Search by title',
  },
  book: {
    label: 'Books',
    itemNoun: 'book',
    icon: Book,
    textClass: 'text-cat-book',
    bgClass: 'bg-cat-book',
    toTryLabel: 'To read',
    doneLabel: 'Read',
    lookup: 'books',
    lookupHint: 'Search by title or author',
  },
  place: {
    label: 'Places',
    itemNoun: 'place',
    icon: MapPin,
    textClass: 'text-cat-place',
    bgClass: 'bg-cat-place',
    toTryLabel: 'To visit',
    doneLabel: 'Visited',
    lookup: 'places',
    lookupHint: 'Search or paste a Google Maps link',
  },
  wishlist: {
    label: 'Wishlist',
    itemNoun: 'item',
    icon: Gift,
    textClass: 'text-cat-wishlist',
    bgClass: 'bg-cat-wishlist',
    toTryLabel: 'Wanted',
    doneLabel: 'Got it',
    lookup: 'url',
    lookupHint: 'Paste a product link to auto-fill',
  },
}

export const LIST_TYPE_CONFIG: Record<
  ListType,
  { label: string; icon: LucideIcon; textClass: string; bgClass: string }
> = {
  ...CATEGORIES,
  mixed: {
    label: 'Mixed',
    icon: Layers,
    textClass: 'text-cat-mixed',
    bgClass: 'bg-cat-mixed',
  },
  trip: {
    label: 'Trip',
    icon: Compass,
    textClass: 'text-cat-trip',
    bgClass: 'bg-cat-trip',
  },
}

export function statusLabel(type: ItemType, status: ItemStatus): string {
  const cat = CATEGORIES[type]
  if (status === 'to_try') return cat.toTryLabel
  if (status === 'done') return cat.doneLabel
  return 'Not for us'
}
