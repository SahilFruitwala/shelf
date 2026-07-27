import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import type { SearchSchemaInput } from '@tanstack/react-router'
import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  ArrowDownUp,
  Clapperboard,
  ListFilter,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  DoorOpen,
  FolderInput,
  Map as MapIcon,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'

import { ITEM_STATUSES } from '#/db/schema'
import type { Item, ItemStatus, ListType } from '#/db/schema'
import { LIST_TYPE_CONFIG, CATEGORIES } from '#/lib/categories'
import { isMultiTypeShelf, isTripShelf } from '#/lib/list-types'
import { cn, existingDayGroups, haversineKm, itemCoords } from '#/lib/utils'
import { useHotkey } from '#/lib/use-hotkey'
import {
  ITEM_SORTS,
  bulkDeleteItems,
  bulkMoveItems,
  bulkSetItemStatus,
  getListItems,
} from '#/server/items'
import type { ItemSort } from '#/server/items'
import {
  deleteList,
  getList,
  getMyLists,
  leaveList,
  renameList,
} from '#/server/lists'
import { AddItemDialog } from '#/components/add-item'
import { ItemCard } from '#/components/item-card'
import { ShareDialog } from '#/components/share-dialog'
import { TripMapPanel } from '#/components/trip-map-panel'
import type { MapPinItem } from '#/components/trip-map'
import {
  Button,
  ConfirmDialog,
  Field,
  Hint,
  Input,
  Modal,
  Select,
  Spinner,
} from '#/components/ui'
import { ItemGridSkeleton, ListPageSkeleton } from '#/components/skeletons'

type StatusFilter = ItemStatus | 'all'
type SortKey = ItemSort | 'near'

/** Shelves open on the watchlist — the things still waiting on you. */
const DEFAULT_FILTER: StatusFilter = 'to_try'

const STATUS_FILTERS: ReadonlyArray<string> = [
  'all',
  ...ITEM_STATUSES,
] satisfies ReadonlyArray<StatusFilter>
const SORT_KEYS: ReadonlyArray<string> = [
  ...ITEM_SORTS,
  'near',
] satisfies ReadonlyArray<SortKey>

/** What you're looking at lives in the URL, so a refresh or a shared link
 *  lands on the same page, filter and sort rather than resetting. */
interface ListSearch {
  page: number
  status: StatusFilter
  sort: SortKey
  genres: Array<string>
}

export const Route = createFileRoute('/_app/list/$listId')({
  // Input is Partial so every field has a default and plain <Link to="/list/…">
  // stays valid without spelling out search params.
  validateSearch: (
    search: Partial<Record<keyof ListSearch, unknown>> & SearchSchemaInput,
  ): ListSearch => {
    const page = Number(search.page)
    const status = String(search.status)
    const sort = String(search.sort)
    return {
      page: Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1,
      status: STATUS_FILTERS.includes(status)
        ? (status as StatusFilter)
        : DEFAULT_FILTER,
      sort: SORT_KEYS.includes(sort) ? (sort as SortKey) : 'recent',
      genres: Array.isArray(search.genres)
        ? search.genres.filter((g): g is string => typeof g === 'string')
        : [],
    }
  },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['list', params.listId],
      queryFn: () => getList({ data: params.listId }),
    })
  },
  component: ListPage,
  pendingComponent: ListPageSkeleton,
})

const PAGE_SIZE = 24
/** Big enough that a realistic itinerary or local list arrives in one page. */
const WHOLE_SHELF_PAGE_SIZE = 500

/** Itinerary and map views need every pin at once, so those shelves load in
 *  full; media shelves (which run to thousands of rows) get numbered pages. */
function loadsEverything(type: ListType | undefined) {
  if (!type) return false
  return type === 'restaurant' || type === 'place' || isMultiTypeShelf(type)
}

/** Page numbers with ellipses — always shows first, last and the neighbours. */
function pageWindow(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages = new Set([1, total, current, current - 1, current + 1])
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p))
  if (current >= total - 2)
    [total - 3, total - 2, total - 1].forEach((p) => pages.add(p))

  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b)
  const out: Array<number | 'gap'> = []
  for (const [i, p] of sorted.entries()) {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap')
    out.push(p)
  }
  return out
}

function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number
  totalPages: number
  total: number
  onChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  const btn =
    'inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-(--radius-control) border px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <nav
      aria-label="Pagination"
      className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className={cn(
          btn,
          'border-line bg-card-deep text-ink-soft hover:text-ink',
        )}
      >
        <ChevronLeft className="size-4" />
      </button>

      {pageWindow(page, totalPages).map((p, i) =>
        p === 'gap' ? (
          <span
            key={`gap-${i}`}
            className="px-1 text-[13px] text-ink-faint"
            aria-hidden
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              btn,
              p === page
                ? 'border-ink bg-ink text-bg'
                : 'border-line bg-card-deep text-ink-soft hover:text-ink',
            )}
          >
            {p}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        className={cn(
          btn,
          'border-line bg-card-deep text-ink-soft hover:text-ink',
        )}
      >
        <ChevronRight className="size-4" />
      </button>

      <span className="ml-2 w-full text-center text-[12px] text-ink-faint sm:w-auto">
        {total.toLocaleString()} items
      </span>
    </nav>
  )
}
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

const BASE_SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'recent', label: 'Recently added' },
  { key: 'alpha', label: 'A–Z' },
  { key: 'completed', label: 'Recently done' },
]

/** Multi-select genre filter — a checkbox popover styled like the toolbar. */
function GenreFilter({
  options,
  selected,
  onChange,
}: {
  options: Array<string>
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function toggle(g: string) {
    const next = new Set(selected)
    if (next.has(g)) next.delete(g)
    else next.add(g)
    onChange(next)
  }

  const active = selected.size > 0
  const label = !active
    ? 'All genres'
    : selected.size === 1
      ? [...selected][0]
      : `${selected.size} genres`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'inline-flex cursor-pointer items-center gap-2 rounded-(--radius-control) border bg-card-deep py-1.5 pl-8 pr-8 text-[13px] font-medium text-ink-soft transition-colors hover:text-ink',
          active ? 'border-ink-faint text-ink' : 'border-line',
        )}
      >
        <Clapperboard className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
        {label}
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-48 overflow-y-auto rounded-(--radius-control) border border-line bg-card p-1 shadow-xl">
          {active && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="mb-1 flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-faint hover:bg-card-deep hover:text-ink"
            >
              <X className="size-3.5" />
              Clear
            </button>
          )}
          {options.map((g) => {
            const on = selected.has(g)
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggle(g)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-soft hover:bg-card-deep hover:text-ink"
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border',
                    on
                      ? 'border-ink bg-ink text-bg'
                      : 'border-line bg-card-deep',
                  )}
                >
                  {on && <Check className="size-3" />}
                </span>
                {g}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RenameListDialog({
  open,
  onClose,
  listId,
  currentName,
  onRenamed,
}: {
  open: boolean
  onClose: () => void
  listId: string
  currentName: string
  onRenamed: () => Promise<void>
}) {
  const [name, setName] = useState(currentName)

  useEffect(() => {
    if (open) setName(currentName)
  }, [open, currentName])

  const rename = useMutation({
    mutationFn: () => renameList({ data: { listId, name } }),
    onSuccess: async () => {
      onClose()
      await onRenamed()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Rename shelf">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          rename.mutate()
        }}
        className="space-y-4"
      >
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </Field>
        {rename.isError && (
          <p className="text-sm text-danger">{rename.error.message}</p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={rename.isPending || !name.trim()}
          className="w-full"
        >
          Save name
        </Button>
      </form>
    </Modal>
  )
}

function BulkMoveDialog({
  open,
  onClose,
  listType,
  sourceListId,
  itemIds,
  onMoved,
}: {
  open: boolean
  onClose: () => void
  listType: ListType
  sourceListId: string
  itemIds: Array<string>
  onMoved: () => Promise<void>
}) {
  const { data: allLists = [] } = useQuery({
    queryKey: ['lists'],
    queryFn: () => getMyLists(),
    enabled: open,
  })
  const targets = allLists.filter(
    (l) =>
      l.id !== sourceListId &&
      (isMultiTypeShelf(listType) ||
        l.type === listType ||
        isMultiTypeShelf(l.type)),
  )

  const move = useMutation({
    mutationFn: (targetListId: string) =>
      bulkMoveItems({ data: { itemIds, targetListId } }),
    onSuccess: async () => {
      onClose()
      await onMoved()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Move selected items">
      {targets.length === 0 ? (
        <p className="py-4 text-[15px] text-ink-soft">
          No other shelf can hold these — create a compatible shelf first.
        </p>
      ) : (
        <ul className="space-y-1">
          {targets.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => move.mutate(l.id)}
                disabled={move.isPending}
                className="flex w-full cursor-pointer items-center gap-3 rounded-(--radius-control) border border-line bg-card-deep p-3 text-left transition-colors hover:border-ink-faint disabled:opacity-50"
              >
                <span className="text-[15px] font-medium">{l.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {move.isError && (
        <p className="mt-3 text-sm text-danger">{move.error.message}</p>
      )}
    </Modal>
  )
}

function ListPage() {
  const { listId } = Route.useParams()
  const { userFeatures } = Route.useRouteContext()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: list } = useQuery({
    queryKey: ['list', listId],
    queryFn: () => getList({ data: listId }),
  })

  const [adding, setAdding] = useState(false)
  const [sharing, setSharing] = useState(false)

  useHotkey('a', () => setAdding(true))

  const { page, status: filter, sort, genres: genreKey } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  // Changing what's shown always returns to page 1 — page 7 of the old filter
  // rarely means anything under the new one.
  const setSearch = (next: Partial<ListSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }) })
  const setFilter = (status: StatusFilter) => setSearch({ status, page: 1 })
  const setSort = (next: SortKey) => setSearch({ sort: next, page: 1 })
  const setPage = (next: number) => setSearch({ page: next })
  // Empty = all genres. An item matches if it has any selected genre.
  const genreFilter = useMemo(() => new Set(genreKey), [genreKey])
  const setGenreFilter = (next: Set<string>) =>
    setSearch({ genres: [...next].sort((a, b) => a.localeCompare(b)), page: 1 })
  const [tripView, setTripView] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [mapDayFilter, setMapDayFilter] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const isDark = useIsDark()
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkMoving, setBulkMoving] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    description: string
    confirmLabel: string
    onConfirm: () => void
  } | null>(null)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const [geoError, setGeoError] = useState<string | null>(null)

  // 'near' is a client-side sort over coordinates, so the server pages by the
  // nearest equivalent and the distance ordering is applied to what's loaded.
  const serverSort: ItemSort = sort === 'near' ? 'recent' : sort
  // Map pins and itineraries only make sense with the whole shelf in hand, so
  // those types come back in one big page instead of being paged through.
  const perPage = loadsEverything(list?.type)
    ? WHOLE_SHELF_PAGE_SIZE
    : PAGE_SIZE

  const itemsQuery = useQuery({
    // Nested under ['list', listId] so existing invalidations still reach it.
    queryKey: [
      'list',
      listId,
      'items',
      filter,
      genreKey,
      serverSort,
      page,
      perPage,
    ],
    queryFn: () =>
      getListItems({
        data: {
          listId,
          status: filter,
          genres: genreKey,
          sort: serverSort,
          page,
          perPage,
        },
      }),
    // Keeps the previous page on screen while the next one loads, so the grid
    // doesn't collapse to a skeleton on every page change.
    placeholderData: keepPreviousData,
  })

  const loadedItems = itemsQuery.data?.items ?? []
  const totalPages = itemsQuery.data?.totalPages ?? 1

  const isGeoShelf =
    list?.type === 'restaurant' ||
    list?.type === 'place' ||
    isTripShelf(list?.type ?? 'restaurant')
  const hasCoords = loadedItems.some((i) => itemCoords(i.metadata))
  const coordsCount = loadedItems.filter((i) => itemCoords(i.metadata)).length
  const sortOptions = useMemo(() => {
    if (isGeoShelf && hasCoords)
      return [
        ...BASE_SORT_OPTIONS,
        { key: 'near' as const, label: 'Nearest first' },
      ]
    return BASE_SORT_OPTIONS
  }, [isGeoShelf, hasCoords])
  const unscheduledCount = useMemo(() => {
    if (!list || !isMultiTypeShelf(list.type)) return 0
    return loadedItems.filter((i) => !i.metadata?.group?.trim()).length
  }, [list, loadedItems])

  useEffect(() => {
    setTripView(list?.type === 'trip')
    setShowMap(list?.type === 'trip')
    setMapDayFilter(null)
  }, [list?.type, listId])

  useEffect(() => {
    if (sort !== 'near') return
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not available in this browser')
      return
    }
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setUserPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => setGeoError("Couldn't get your location — check permissions"),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }, [sort])

  useEffect(() => {
    if (sort === 'near' && !hasCoords) setSort('recent')
  }, [sort, hasCoords])

  const removeList = useMutation({
    mutationFn: () => deleteList({ data: listId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lists'] })
      await router.navigate({ to: '/' })
    },
  })
  const leave = useMutation({
    mutationFn: () => leaveList({ data: listId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lists'] })
      await router.navigate({ to: '/' })
    },
  })
  const bulkDone = useMutation({
    mutationFn: (itemIds: Array<string>) =>
      bulkSetItemStatus({ data: { itemIds, status: 'done' } }),
    onSuccess: async () => {
      setSelected(new Set())
      setSelecting(false)
      await queryClient.invalidateQueries({ queryKey: ['list', listId] })
      await queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
  const bulkRemove = useMutation({
    mutationFn: (itemIds: Array<string>) => bulkDeleteItems({ data: itemIds }),
    onSuccess: async () => {
      setSelected(new Set())
      setSelecting(false)
      await queryClient.invalidateQueries({ queryKey: ['list', listId] })
      await queryClient.invalidateQueries({ queryKey: ['lists'] })
      await queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })

  if (!list) {
    return <ListPageSkeleton />
  }

  const config = LIST_TYPE_CONFIG[list.type]
  const memberNames = new Map(list.members.map((m) => [m.userId, m.name]))
  const showAddedBy = list.members.length > 1

  const toTryLabel = isMultiTypeShelf(list.type)
    ? 'To try'
    : CATEGORIES[list.type as keyof typeof CATEGORIES].toTryLabel
  const doneLabel = isMultiTypeShelf(list.type)
    ? 'Done'
    : CATEGORIES[list.type as keyof typeof CATEGORIES].doneLabel
  const tripShelf = isTripShelf(list.type)
  const multiShelf = isMultiTypeShelf(list.type)
  const supportsMap =
    tripShelf ||
    list.type === 'restaurant' ||
    list.type === 'place' ||
    (multiShelf && tripView)
  const showItinerary = tripView && multiShelf

  const { counts, genreOptions } = list
  // Status, genre and sort are all applied in SQL — these rows are the result.
  const filtered = loadedItems

  const distances = useMemo(() => {
    if (sort !== 'near' || !userPos) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const item of filtered) {
      const coords = itemCoords(item.metadata)
      if (!coords) continue
      map.set(
        item.id,
        haversineKm(userPos.lat, userPos.lng, coords.lat, coords.lng),
      )
    }
    return map
  }, [filtered, sort, userPos])

  const visible = useMemo(() => {
    if (sort !== 'near') return filtered
    return [...filtered].sort(
      (a, b) =>
        (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity),
    )
  }, [filtered, sort, distances])

  const tripGroups = useMemo(() => {
    if (!showItinerary) return null
    const groups = new Map<string, Array<Item>>()
    for (const item of visible) {
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
  }, [showItinerary, visible])

  const mapPins = useMemo((): Array<MapPinItem> => {
    if (!supportsMap) return []
    return visible
      .filter((item) => {
        if (item.type !== 'restaurant' && item.type !== 'place') return false
        if (mapDayFilter) {
          const group = item.metadata?.group?.trim() || 'Unscheduled'
          if (group !== mapDayFilter) return false
        }
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
  }, [supportsMap, visible, mapDayFilter])

  const dayGroups = useMemo(() => existingDayGroups(loadedItems), [loadedItems])

  const mapDayOptions = useMemo(() => {
    if (!tripGroups) return []
    return tripGroups
      .filter((group) =>
        group.items.some(
          (i) =>
            (i.type === 'restaurant' || i.type === 'place') &&
            itemCoords(i.metadata),
        ),
      )
      .map((group) => group.key)
  }, [tripGroups])

  const geoPinCount = useMemo(
    () =>
      loadedItems.filter(
        (i) =>
          (i.type === 'restaurant' || i.type === 'place') &&
          itemCoords(i.metadata),
      ).length,
    [loadedItems],
  )

  const mapMode = supportsMap && showMap
  const mapListItems = useMemo(() => {
    if (!mapMode) return visible
    return visible.filter((i) => i.type === 'restaurant' || i.type === 'place')
  }, [mapMode, visible])
  const showReactions = list.members.length > 1
  const selectedIds = [...selected]

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function focusItemOnMap(item: Item) {
    const coords = itemCoords(item.metadata)
    if (!coords) return
    setMapFocus(coords)
    setFocusedItemId(item.id)
    if (!showMap) setShowMap(true)
  }

  function renderItem(item: Item) {
    const coords = itemCoords(item.metadata)
    const canPin =
      supportsMap &&
      coords != null &&
      (item.type === 'restaurant' || item.type === 'place')
    return (
      <ItemCard
        key={item.id}
        item={item}
        listId={listId}
        showType={multiShelf && !mapMode}
        showGroup={multiShelf && showItinerary && !mapMode}
        memberNames={showAddedBy ? memberNames : new Map()}
        reactions={list!.reactionsByItem[item.id]}
        myUserId={list!.myUserId}
        showReactions={showReactions && !mapMode}
        distanceKm={sort === 'near' ? (distances.get(item.id) ?? null) : null}
        selectable={selecting}
        selected={selected.has(item.id)}
        onToggleSelect={() => toggleItem(item.id)}
        onShowOnMap={canPin ? () => focusItemOnMap(item) : undefined}
        compact={mapMode}
        mapActive={focusedItemId === item.id}
      />
    )
  }

  const filters: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'to_try', label: toTryLabel },
    { key: 'done', label: doneLabel },
    ...(counts.abandoned > 0 || filter === 'abandoned'
      ? [{ key: 'abandoned' as const, label: 'Not for us' }]
      : []),
  ]

  return (
    <main>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        All shelves
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className={cn(tripShelf && 'max-w-2xl')}>
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
          <h1
            className={cn(
              'text-hero mt-1 font-display text-3xl font-bold sm:text-4xl',
              tripShelf && 'text-balance',
            )}
          >
            {list.name}
            {list.isOwner && !list.isDefault && (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                title="Rename shelf"
                className="ml-2 inline-flex cursor-pointer items-center rounded-full p-1.5 align-middle text-ink-faint transition-colors hover:bg-card-deep hover:text-ink"
              >
                <Pencil className="size-4" />
              </button>
            )}
          </h1>
          {tripShelf && (
            <p className="mt-1.5 text-[14px] text-ink-soft">
              Your itinerary — slot items by day, then flip the map to see
              restaurants and places together.
            </p>
          )}
          {list.type === 'mixed' && (
            <p className="mt-1.5 text-[14px] text-ink-soft">
              Mixed shelf — use{' '}
              <span className="font-medium text-ink">Trip view</span> below to
              group by day.
            </p>
          )}
          {showAddedBy && (
            <p className="mt-1.5 text-[14px] text-ink-soft">
              With{' '}
              {list.members
                .filter((m) => m.userId !== list.myUserId)
                .map((m) => m.name)
                .join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {userFeatures.sharing && (
            <Button variant="quiet" onClick={() => setSharing(true)}>
              <UserPlus className="size-4" />
              Share
            </Button>
          )}
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>

      {counts.all > 0 && (
        <div className="mb-5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[13px]">
            <div className="relative">
              <ListFilter className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-ink-faint" />
              <Select
                compact
                value={filter}
                onChange={(e) => setFilter(e.target.value as StatusFilter)}
                aria-label="Filter by status"
                className={cn('pl-8', filter !== 'all' && 'border-ink-faint')}
              >
                {filters.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label} ({counts[f.key]})
                  </option>
                ))}
              </Select>
            </div>

            {genreOptions.length > 1 && (
              <GenreFilter
                options={genreOptions}
                selected={genreFilter}
                onChange={setGenreFilter}
              />
            )}

            <div className="relative">
              <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-ink-faint" />
              <Select
                compact
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort items"
                className="pl-8"
              >
                {sortOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>

            {multiShelf && (
              <button
                onClick={() => setTripView((v) => !v)}
                title="Group items by day or plan — for trip itineraries"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition-colors cursor-pointer',
                  tripView
                    ? 'bg-ink text-bg'
                    : 'border border-line bg-card-deep text-ink-soft hover:text-ink',
                )}
              >
                <CalendarDays className="size-3.5" />
                Trip view
              </button>
            )}

            {supportsMap && (
              <button
                onClick={() => setShowMap((v) => !v)}
                title="Show restaurants and places on a map"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition-colors cursor-pointer',
                  showMap
                    ? tripShelf
                      ? 'bg-cat-trip text-white'
                      : 'bg-ink text-bg'
                    : 'border border-line bg-card-deep text-ink-soft hover:text-ink',
                )}
              >
                <MapIcon className="size-3.5" />
                Map
                {geoPinCount > 0 && (
                  <span
                    className={cn(
                      'opacity-70',
                      showMap && (tripShelf ? 'text-white/80' : 'text-bg/80'),
                    )}
                  >
                    ({geoPinCount})
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => {
                setSelecting((s) => !s)
                setSelected(new Set())
              }}
              title="Select several items to mark done or move together"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition-colors cursor-pointer',
                selecting
                  ? 'bg-ink text-bg'
                  : 'border border-line bg-card-deep text-ink-soft hover:text-ink',
              )}
            >
              <Check className="size-3.5" />
              {selecting ? 'Done selecting' : 'Select multiple'}
            </button>
          </div>
        </div>
      )}

      {showReactions && counts.all > 0 && (
        <Hint dismissKey="hint-reactions" className="mb-4">
          On a shared shelf, tap{' '}
          <strong className="font-medium text-ink">Nice pick</strong> on someone
          else&apos;s addition — a quick nod, not a rating.
        </Hint>
      )}

      {selecting && (
        <Hint className="mb-4">
          {selected.size === 0
            ? 'Check the items you want, then use the bar at the bottom to mark done, move, or remove.'
            : `${selected.size} selected — actions are in the bar below.`}
        </Hint>
      )}

      {showItinerary && (
        <Hint dismissKey="hint-trip" className="mb-4">
          {unscheduledCount > 0 ? (
            <>
              Assign a{' '}
              <strong className="font-medium text-ink">day or group</strong> on
              each item (⋯ → Edit details) to build your itinerary.{' '}
              <span className="text-ink-faint">
                {unscheduledCount} still unscheduled.
              </span>
            </>
          ) : (
            <>
              Items are grouped by the day or plan you set under Edit details.
            </>
          )}
        </Hint>
      )}

      {supportsMap && showMap && (
        <div className="mb-3 space-y-2">
          <p className="text-[13px] text-ink-faint">
            Showing restaurants and places — tap a row to focus it on the map.
          </p>
          {mapDayOptions.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setMapDayFilter(null)}
                className={cn(
                  'rounded-full px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer',
                  mapDayFilter == null
                    ? 'bg-ink text-bg'
                    : 'border border-line bg-card-deep text-ink-soft hover:text-ink',
                )}
              >
                All days
              </button>
              {mapDayOptions.map((day) => (
                <button
                  key={day}
                  onClick={() => setMapDayFilter(day)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer',
                    mapDayFilter === day
                      ? 'bg-ink text-bg'
                      : 'border border-line bg-card-deep text-ink-soft hover:text-ink',
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {sort === 'near' && !userPos && !geoError && (
        <Hint className="mb-4">
          <span className="inline-flex items-center gap-2">
            <Spinner />
            Getting your location to sort by distance…
          </span>
        </Hint>
      )}

      {sort === 'near' && geoError && (
        <Hint className="mb-4">
          <MapPin className="mb-0.5 inline size-3.5" /> {geoError}
        </Hint>
      )}

      {sort === 'near' && userPos && (
        <Hint dismissKey="hint-near" className="mb-4">
          Sorted by distance from you. Only places added via search or Maps
          links have locations ({coordsCount} of {counts.all}).
        </Hint>
      )}

      {isGeoShelf && !hasCoords && counts.all > 0 && sort !== 'near' && (
        <Hint dismissKey="hint-near-missing" className="mb-4">
          Want <strong className="font-medium text-ink">nearest first</strong>{' '}
          sorting? Add restaurants via search or paste a Google Maps link so we
          can save their location.
        </Hint>
      )}

      {counts.all === 0 ? (
        <div className="glow-card rounded-(--radius-card) px-6 py-16 text-center">
          <p className="font-display text-2xl font-semibold">
            Nothing here yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[15px] text-ink-soft">
            Add the first thing — heard about a place, a title, a spot? Put it
            on the shelf before you forget.
          </p>
          <Button
            variant="primary"
            onClick={() => setAdding(true)}
            className="mt-6"
          >
            <Plus className="size-4" />
            Add the first one
          </Button>
        </div>
      ) : itemsQuery.isPending ? (
        <ItemGridSkeleton />
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-[15px] text-ink-faint">
          Nothing matches this filter.
        </p>
      ) : (
        <div
          className={cn(
            'grid w-full items-start gap-4 lg:gap-5',
            mapMode && 'lg:grid-cols-2',
          )}
        >
          <div className="min-w-0 space-y-2">
            {mapMode && mapListItems.length === 0 ? (
              <p className="rounded-(--radius-card) border border-dashed border-line px-4 py-8 text-center text-[14px] text-ink-faint">
                No restaurants or places match this filter.
              </p>
            ) : tripGroups && !mapMode ? (
              <div className="space-y-8">
                {tripGroups.map((group) => (
                  <section
                    key={group.key}
                    className={cn(tripShelf && 'trip-day-section')}
                  >
                    <h2
                      className={cn(
                        'mb-1 font-display text-lg font-semibold',
                        tripShelf && 'trip-day-heading',
                      )}
                    >
                      {group.key}
                    </h2>
                    {group.key === 'Unscheduled' && (
                      <p className="mb-3 text-[13px] text-ink-faint">
                        Open ⋯ → Edit details and add a day or group to slot
                        these in.
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                      {group.items.map(renderItem)}
                    </div>
                  </section>
                ))}
              </div>
            ) : mapMode && tripGroups ? (
              <div className="space-y-5">
                {tripGroups.map((group) => {
                  const items = group.items.filter(
                    (i) => i.type === 'restaurant' || i.type === 'place',
                  )
                  if (items.length === 0) return null
                  return (
                    <section key={group.key}>
                      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
                        {group.key}
                      </h2>
                      <div className="space-y-1.5">{items.map(renderItem)}</div>
                    </section>
                  )
                })}
              </div>
            ) : (
              <div
                className={cn(
                  'grid gap-2',
                  mapMode
                    ? 'grid-cols-1'
                    : 'grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3',
                )}
              >
                {(mapMode ? mapListItems : visible).map(renderItem)}
              </div>
            )}

            {!mapMode && (
              <Pagination
                page={itemsQuery.data?.page ?? 1}
                totalPages={totalPages}
                total={itemsQuery.data?.total ?? 0}
                onChange={(next) => {
                  setPage(next)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              />
            )}
          </div>
          {mapMode && (
            <div className="sticky top-4 min-w-0">
              <TripMapPanel pins={mapPins} focus={mapFocus} dark={isDark} />
            </div>
          )}
        </div>
      )}

      {selecting && (
        <div className="fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-lg flex-wrap items-center justify-center gap-2 rounded-(--radius-card) border border-line bg-card/95 px-4 py-3 shadow-xl backdrop-blur-md sm:inset-x-auto sm:bottom-6 sm:rounded-full sm:px-3 sm:py-2">
          <span className="w-full px-1 text-center text-[13px] font-medium text-ink-soft sm:w-auto sm:text-left">
            {selected.size === 0
              ? 'Select items above'
              : `${selected.size} selected`}
          </span>
          <Button
            variant="quiet"
            className="px-3 py-1.5 text-[13px]"
            onClick={() => bulkDone.mutate(selectedIds)}
            disabled={bulkDone.isPending || selected.size === 0}
          >
            <Check className="size-3.5" />
            Mark done
          </Button>
          <Button
            variant="quiet"
            className="px-3 py-1.5 text-[13px]"
            onClick={() => setBulkMoving(true)}
            disabled={selected.size === 0}
          >
            <FolderInput className="size-3.5" />
            Move
          </Button>
          <Button
            variant="danger"
            className="px-3 py-1.5 text-[13px]"
            onClick={() =>
              setConfirmAction({
                title: 'Remove selected items?',
                description: `${selected.size} item${selected.size === 1 ? '' : 's'} will be removed from this shelf.`,
                confirmLabel: 'Remove',
                onConfirm: () => bulkRemove.mutate(selectedIds),
              })
            }
            disabled={bulkRemove.isPending || selected.size === 0}
          >
            <Trash2 className="size-3.5" />
            Remove
          </Button>
          <Button
            variant="ghost"
            className="px-2 py-1.5"
            onClick={() => {
              setSelecting(false)
              setSelected(new Set())
            }}
            title="Cancel selection"
            aria-label="Cancel selection"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      <div className="mt-14 flex justify-center">
        {list.isDefault ? null : list.isOwner ? (
          <Button
            variant="danger"
            onClick={() =>
              setConfirmAction({
                title: 'Delete this shelf?',
                description: `“${list.name}” and everything on it will be deleted permanently. This can't be undone.`,
                confirmLabel: 'Delete shelf',
                onConfirm: () => removeList.mutate(),
              })
            }
          >
            <Trash2 className="size-4" />
            Delete shelf
          </Button>
        ) : (
          <Button
            variant="danger"
            onClick={() =>
              setConfirmAction({
                title: 'Leave this shelf?',
                description: `You'll lose access to “${list.name}”. The owner can invite you again later.`,
                confirmLabel: 'Leave shelf',
                onConfirm: () => leave.mutate(),
              })
            }
          >
            <DoorOpen className="size-4" />
            Leave shelf
          </Button>
        )}
      </div>

      <AddItemDialog
        open={adding}
        onClose={() => setAdding(false)}
        listId={listId}
        listType={list.type}
        existingGroups={dayGroups}
      />
      <RenameListDialog
        open={renaming}
        onClose={() => setRenaming(false)}
        listId={listId}
        currentName={list.name}
        onRenamed={async () => {
          await queryClient.invalidateQueries({ queryKey: ['list', listId] })
          await queryClient.invalidateQueries({ queryKey: ['lists'] })
        }}
      />
      <ShareDialog
        open={sharing && userFeatures.sharing}
        onClose={() => setSharing(false)}
        listId={listId}
        joinCode={list.joinCode}
        viewCode={list.viewCode}
        members={list.members}
        isOwner={list.isOwner}
        myUserId={list.myUserId}
      />
      <BulkMoveDialog
        open={bulkMoving}
        onClose={() => setBulkMoving(false)}
        listType={list.type}
        sourceListId={listId}
        itemIds={selectedIds}
        onMoved={async () => {
          setSelected(new Set())
          setSelecting(false)
          await queryClient.invalidateQueries({ queryKey: ['list', listId] })
          await queryClient.invalidateQueries({ queryKey: ['lists'] })
        }}
      />
      <ConfirmDialog
        open={confirmAction != null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          confirmAction?.onConfirm()
          setConfirmAction(null)
        }}
        title={confirmAction?.title ?? ''}
        description={confirmAction?.description ?? ''}
        confirmLabel={confirmAction?.confirmLabel}
        destructive
        busy={removeList.isPending || leave.isPending || bulkRemove.isPending}
      />
    </main>
  )
}
