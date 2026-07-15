import { useMemo, useSyncExternalStore } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Compass, ExternalLink, MapPin } from 'lucide-react'

import type { MapPinItem } from '#/components/trip-map'
import { TripMapPanel } from '#/components/trip-map-panel'
import { CATEGORIES, LIST_TYPE_CONFIG, statusLabel } from '#/lib/categories'
import { isMultiTypeShelf, isTripShelf } from '#/lib/list-types'
import { cn, itemCoords, mapsDirectionsUrl } from '#/lib/utils'
import { getPublicList } from '#/server/lists'

export const Route = createFileRoute('/s/$code')({
  loader: ({ params }) => getPublicList({ data: params.code }),
  component: PublicShelfPage,
})

type PublicList = NonNullable<Awaited<ReturnType<typeof getPublicList>>>
type PublicItem = PublicList['items'][number]

function useIsDark() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const observer = new MutationObserver(onStoreChange)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
      return () => observer.disconnect()
    },
    () => document.documentElement.classList.contains('dark'),
    () => true,
  )
}

function PublicItemCard({ item }: { item: PublicItem }) {
  const config = CATEGORIES[item.type]
  const Icon = config.icon
  const done = item.status === 'done'
  const coords = itemCoords(item.metadata)
  const groupLabel = item.metadata?.group?.trim()
  const subtitle = [
    item.metadata?.year,
    item.metadata?.author,
    item.metadata?.address,
    item.metadata?.rating && `★ ${item.metadata.rating}`,
    item.metadata?.price,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <article
      className={cn(
        'glow-card flex gap-4 rounded-(--radius-card) p-4',
        item.status === 'abandoned' && 'opacity-60',
      )}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className={cn(
            'h-24 w-17 shrink-0 rounded-lg border border-line object-cover',
            done && 'saturate-50',
          )}
        />
      ) : (
        <div className="flex h-24 w-17 shrink-0 items-center justify-center rounded-lg border border-line bg-card-deep">
          <Icon className={cn('size-5', config.textClass)} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display text-[17px] font-semibold leading-snug">
              {item.link ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline underline-offset-2"
                >
                  {item.title}
                  <ExternalLink className="ml-1.5 inline size-3.5 align-baseline text-ink-faint" />
                </a>
              ) : (
                item.title
              )}
            </h3>
            <p className="mt-0.5 text-[13px] text-ink-faint">
              {groupLabel && (
                <span className="mr-1.5 inline-flex items-center rounded-full bg-card-deep px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                  {groupLabel}
                </span>
              )}
              {subtitle}
            </p>
            {coords && (
              <a
                href={mapsDirectionsUrl(coords.lat, coords.lng, item.title)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-ink-soft hover:text-ink"
              >
                <MapPin className="size-3" />
                Open in Maps
              </a>
            )}
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
              done
                ? cn(config.bgClass, 'text-white dark:text-black/80')
                : item.status === 'abandoned'
                  ? 'bg-card-deep text-ink-faint'
                  : cn('bg-card-deep', config.textClass),
            )}
          >
            {statusLabel(item.type, item.status)}
          </span>
        </div>
        {item.notes && (
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
            {item.notes}
          </p>
        )}
      </div>
    </article>
  )
}

function PublicShelfContent({ list }: { list: PublicList }) {
  const isDark = useIsDark()
  const tripShelf = isTripShelf(list.type)
  const multiShelf = isMultiTypeShelf(list.type)
  const hasGroups = list.items.some((i) => i.metadata?.group?.trim())
  const showItinerary = tripShelf || (multiShelf && hasGroups)

  const tripGroups = useMemo(() => {
    if (!showItinerary) return null
    const groups = new Map<string, Array<PublicItem>>()
    for (const item of list.items) {
      const key = item.metadata?.group?.trim() || 'Unscheduled'
      const arr = groups.get(key) ?? []
      arr.push(item)
      groups.set(key, arr)
    }
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === 'Unscheduled') return 1
      if (b === 'Unscheduled') return -1
      return a.localeCompare(b, undefined, { sensitivity: 'base' })
    })
    return keys.map((key) => ({ key, items: groups.get(key)! }))
  }, [list.items, showItinerary])

  const mapPins = useMemo((): Array<MapPinItem> => {
    return list.items
      .filter((item) => {
        if (item.type !== 'restaurant' && item.type !== 'place') return false
        return itemCoords(item.metadata) != null
      })
      .map((item) => {
        const coords = itemCoords(item.metadata)!
        return {
          id: item.id,
          title: item.title,
          type: item.type,
          lat: coords.lat,
          lng: coords.lng,
          address: item.metadata?.address,
          group: item.metadata?.group,
        }
      })
  }, [list.items])

  const showMap =
    mapPins.length > 0 &&
    (tripShelf || list.type === 'restaurant' || list.type === 'place')

  const config = LIST_TYPE_CONFIG[list.type]

  return (
    <>
      <div className="mb-6">
        <p
          className={cn(
            'text-[13px] font-semibold uppercase tracking-wide',
            config.textClass,
          )}
        >
          {tripShelf ? (
            <span className="inline-flex items-center gap-1.5">
              <Compass className="size-3.5" />
              {config.label}
            </span>
          ) : (
            config.label
          )}
        </p>
        <h1 className="text-hero mt-1 font-display text-3xl font-bold sm:text-4xl">
          {list.name}
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-soft">
          A shelf shared by {list.ownerName} · view only
        </p>
        {tripShelf && showMap && (
          <p className="mt-1 text-[13px] text-ink-faint">
            Itinerary with map — restaurants and places pinned below.
          </p>
        )}
      </div>

      {list.items.length === 0 ? (
        <p className="py-12 text-center text-[15px] text-ink-faint">
          Nothing on this shelf yet.
        </p>
      ) : (
        <div
          className={cn(
            'grid w-full items-start gap-4 lg:gap-5',
            showMap && 'lg:grid-cols-2',
          )}
        >
          <div className="min-w-0 space-y-2">
            {tripGroups ? (
              <div className="space-y-8">
                {tripGroups.map((group) => (
                  <section
                    key={group.key}
                    className={cn(tripShelf && 'trip-day-section')}
                  >
                    <h2
                      className={cn(
                        'mb-3 font-display text-lg font-semibold',
                        tripShelf && 'trip-day-heading',
                      )}
                    >
                      {group.key}
                    </h2>
                    <div className="grid grid-cols-1 gap-3">
                      {group.items.map((item) => (
                        <PublicItemCard key={item.id} item={item} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {list.items.map((item) => (
                  <PublicItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>

          {showMap && (
            <div className="sticky top-4 min-w-0">
              <TripMapPanel pins={mapPins} focus={null} dark={isDark} />
            </div>
          )}
        </div>
      )}
    </>
  )
}

function PublicShelfPage() {
  const list = Route.useLoaderData()

  return (
    <div className="mx-auto min-h-dvh w-full max-w-5xl px-4 pb-24 sm:px-8">
      <header className="mb-2 flex items-center justify-between border-b border-line py-3 sm:py-4">
        <Link to="/" className="font-display text-[22px] font-bold">
          Shelf
          <span className="text-accent">.</span>
        </Link>
      </header>

      {!list ? (
        <main className="mx-auto max-w-md py-16 text-center">
          <h1 className="font-display text-2xl font-semibold">
            This shelf isn't shared anymore
          </h1>
          <p className="mt-2 text-[15px] text-ink-soft">
            The link may have been turned off by the shelf's owner.
          </p>
        </main>
      ) : (
        <main className="pt-6">
          <PublicShelfContent list={list} />
        </main>
      )}
    </div>
  )
}
