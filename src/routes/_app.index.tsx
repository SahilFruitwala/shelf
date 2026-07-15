import { useEffect, useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Users, X } from 'lucide-react'

import { LIST_TYPES } from '#/db/schema'
import type { ListType } from '#/db/schema'
import { CATEGORIES, LIST_TYPE_CONFIG } from '#/lib/categories'
import { isTripShelf } from '#/lib/list-types'
import { cn, timeAgo } from '#/lib/utils'
import { getDustyItems, searchMyItems } from '#/server/items'
import { createList, getMyLists } from '#/server/lists'
import { ActivityFeed } from '#/components/activity-feed'
import { AddItemDialog } from '#/components/add-item'
import { HoverHighlight } from '#/components/aceternity'
import { ItemCard } from '#/components/item-card'
import { Button, Field, Input, Modal, SectionLabel } from '#/components/ui'

export const Route = createFileRoute('/_app/')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['lists'],
      queryFn: () => getMyLists(),
    })
  },
  component: HomePage,
})

type ListSummary = Awaited<ReturnType<typeof getMyLists>>[number]

function CoverStrip({
  images,
  type,
}: {
  images: Array<string>
  type: ListType
}) {
  const config = LIST_TYPE_CONFIG[type]
  const Icon = config.icon
  return (
    <div className="flex h-24 items-center gap-2 overflow-hidden">
      {images.length === 0 ? (
        <div className="flex h-24 w-full items-center justify-center rounded-lg bg-card-deep/50">
          <Icon className={cn('size-6 opacity-50', config.textClass)} />
        </div>
      ) : (
        images.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            loading="lazy"
            className="h-24 w-16 rounded-lg object-cover"
          />
        ))
      )}
    </div>
  )
}

function ListCard({ list }: { list: ListSummary }) {
  const config = LIST_TYPE_CONFIG[list.type]
  const trip = isTripShelf(list.type)
  return (
    <Link
      to="/list/$listId"
      params={{ listId: list.id }}
      className={cn(
        'block h-full rounded-(--radius-card) bg-card p-4 transition-transform hover:translate-y-[-1px]',
        trip && 'trip-card',
      )}
    >
      {trip ? (
        <div className="relative flex h-24 items-center justify-between overflow-hidden rounded-lg bg-card-deep/60 px-4">
          <config.icon className={cn('size-8', config.textClass)} />
          <span className="rounded-full border border-line bg-card/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            Itinerary
          </span>
        </div>
      ) : (
        <CoverStrip images={list.coverImages} type={list.type} />
      )}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold leading-snug">
            {list.name}
          </h2>
          {list.memberCount > 1 && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-ink-faint">
              <Users className="size-3.5" />
              {list.memberCount}
            </span>
          )}
        </div>
        <p className="mt-1 text-[13px] text-ink-soft">
          {/* Built-in shelves are already named after their category. */}
          {!list.isDefault && (
            <span className={cn('font-medium', config.textClass)}>
              {config.label}
              {' · '}
            </span>
          )}
          <span className="text-ink-faint">
            {list.itemCount === 0
              ? 'Empty'
              : list.toTryCount > 0
                ? `${list.toTryCount} waiting`
                : 'All done'}
          </span>
        </p>
      </div>
    </Link>
  )
}

function NewListDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<ListType>('restaurant')
  const standardTypes = LIST_TYPES.filter((t) => t !== 'trip')

  const create = useMutation({
    mutationFn: () => createList({ data: { name, type } }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['lists'] })
      onClose()
      await router.navigate({ to: '/list/$listId', params: { listId: id } })
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="New shelf">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
        className="space-y-5"
      >
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Date night spots, Summer reading…"
            required
            autoFocus
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
            What goes on it?
          </span>

          {(() => {
            const tripConfig = LIST_TYPE_CONFIG.trip
            const TripIcon = tripConfig.icon
            const tripSelected = type === 'trip'
            return (
              <button
                type="button"
                onClick={() => setType('trip')}
                className={cn(
                  'mb-3 flex w-full cursor-pointer items-start gap-3 rounded-(--radius-card) border px-4 py-3.5 text-left transition-colors',
                  tripSelected
                    ? 'border-cat-trip bg-cat-trip/10'
                    : 'border-line bg-card-deep hover:border-ink-faint',
                )}
              >
                <TripIcon
                  className={cn(
                    'mt-0.5 size-5 shrink-0',
                    tripSelected ? tripConfig.textClass : 'text-ink-faint',
                  )}
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">
                    Trip
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">
                    Plan a getaway — group by day, map restaurants &amp; places,
                    mix in movies and books.
                  </span>
                </span>
              </button>
            )
          })()}

          <div className="grid grid-cols-2 gap-2">
            {standardTypes.map((t) => {
              const config = LIST_TYPE_CONFIG[t]
              const Icon = config.icon
              const selected = type === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-(--radius-control) border px-3 py-2.5 text-sm font-medium transition-colors',
                    selected
                      ? 'border-accent bg-accent-soft text-ink'
                      : 'border-line bg-card-deep text-ink-soft hover:text-ink',
                  )}
                >
                  <Icon
                    className={cn(
                      'size-4',
                      selected ? config.textClass : undefined,
                    )}
                  />
                  {config.label}
                </button>
              )
            })}
          </div>
          {type === 'mixed' && (
            <p className="mt-2 text-[13px] text-ink-faint">
              A mixed shelf can hold anything — pick the kind per item as you
              add it.
            </p>
          )}
          {type === 'trip' && (
            <p className="mt-2 text-[13px] text-ink-faint">
              Opens in itinerary view with a map for spots you add via search or
              Google Maps links.
            </p>
          )}
        </div>

        {create.isError && (
          <p className="text-sm text-danger">{create.error.message}</p>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={create.isPending}
          className="w-full py-3"
        >
          Create shelf
        </Button>
      </form>
    </Modal>
  )
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function SearchResults({ query }: { query: string }) {
  const { data: results, isPending } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchMyItems({ data: query }),
  })

  if (isPending)
    return (
      <p className="py-12 text-center text-[15px] text-ink-faint">Searching…</p>
    )
  if (!results || results.length === 0)
    return (
      <p className="py-12 text-center text-[15px] text-ink-faint">
        Nothing on your shelves matches “{query}”.
      </p>
    )

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {results.map((item) => (
        <div key={item.id}>
          <ItemCard
            item={item}
            listId={item.listId}
            showType
            memberNames={new Map()}
          />
          <p className="mt-1 px-1 text-right text-[12px] text-ink-faint">
            on{' '}
            <Link
              to="/list/$listId"
              params={{ listId: item.listId }}
              className="underline-offset-2 hover:text-ink hover:underline"
            >
              {item.listName}
            </Link>
          </p>
        </div>
      ))}
    </div>
  )
}

function DustyShelf() {
  const { data: dusty = [] } = useQuery({
    queryKey: ['dusty'],
    queryFn: () => getDustyItems(),
  })

  if (dusty.length === 0) return null

  return (
    <section className="mt-12">
      <SectionLabel className="mb-1">Gathering dust</SectionLabel>
      <p className="mb-4 text-[14px] text-ink-soft">
        Still waiting after all this time — try one, or admit it's not
        happening.
      </p>
      <div className="glow-card rounded-(--radius-card) px-5 py-2">
        {dusty.map((item) => {
          const config = CATEGORIES[item.type]
          const Icon = config.icon
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 border-b border-line py-2.5 text-[14px] last:border-b-0"
            >
              <Icon className={cn('size-4 shrink-0', config.textClass)} />
              <p className="min-w-0 flex-1 truncate text-ink-soft">
                <span className="font-medium text-ink">{item.title}</span> on{' '}
                <Link
                  to="/list/$listId"
                  params={{ listId: item.listId }}
                  className="underline-offset-2 hover:text-ink hover:underline"
                >
                  {item.listName}
                </Link>
              </p>
              <span className="shrink-0 text-[12px] text-ink-faint">
                added {timeAgo(item.createdAt)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function HomePage() {
  const { user } = Route.useRouteContext()
  const { data: lists = [] } = useQuery({
    queryKey: ['lists'],
    queryFn: () => getMyLists(),
  })
  const [creating, setCreating] = useState(false)
  const [adding, setAdding] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim(), 250)
  const searching = query.length >= 2

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div>
          <h1 className="text-hero font-display text-3xl font-bold sm:text-4xl">
            Your shelves
          </h1>
          {lists.length > 0 && (
            <p className="mt-1.5 text-[15px] text-ink-soft">
              {(() => {
                const waiting = lists.reduce((n, l) => n + l.toTryCount, 0)
                return waiting === 1
                  ? '1 thing waiting to be tried'
                  : `${waiting} things waiting to be tried`
              })()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" onClick={() => setCreating(true)}>
            New shelf
          </Button>
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>

      {lists.length > 0 && (
        <div className="relative mb-6">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search everything on your shelves…"
            className="pl-10 pr-10"
            aria-describedby={search.length === 1 ? 'search-hint' : undefined}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-ink-faint hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
          {search.length === 1 && (
            <p id="search-hint" className="mt-1.5 text-[13px] text-ink-faint">
              Type one more character to search.
            </p>
          )}
        </div>
      )}

      {searching ? (
        <SearchResults query={query} />
      ) : lists.length === 0 ? (
        <div className="glow-card rounded-(--radius-card) px-6 py-16 text-center">
          <p className="font-display text-2xl font-semibold">
            Save the next thing before you forget it
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[15px] text-ink-soft">
            A restaurant someone mentioned, a movie, a book — add it and it
            files itself onto the right shelf.
          </p>
          <Button
            variant="primary"
            onClick={() => setAdding(true)}
            className="mt-6"
          >
            <Plus className="size-4" />
            Add your first thing
          </Button>
        </div>
      ) : (
        <div onMouseLeave={() => setHovered(null)}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lists
              .filter((l) => l.isDefault)
              .map((list) => (
                <div key={list.id} onMouseEnter={() => setHovered(list.id)}>
                  <HoverHighlight active={hovered === list.id}>
                    <ListCard list={list} />
                  </HoverHighlight>
                </div>
              ))}
          </div>

          {lists.some((l) => !l.isDefault) && (
            <>
              <SectionLabel className="mt-10">
                Custom & shared shelves
              </SectionLabel>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lists
                  .filter((l) => !l.isDefault)
                  .map((list) => (
                    <div key={list.id} onMouseEnter={() => setHovered(list.id)}>
                      <HoverHighlight active={hovered === list.id}>
                        <ListCard list={list} />
                      </HoverHighlight>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {!searching && (
        <>
          <DustyShelf />
          <ActivityFeed myUserId={user.id} />
        </>
      )}

      <NewListDialog open={creating} onClose={() => setCreating(false)} />
      <AddItemDialog open={adding} onClose={() => setAdding(false)} />
    </main>
  )
}
