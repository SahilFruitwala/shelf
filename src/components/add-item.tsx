import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Link2, MapPin, PenLine, Search } from 'lucide-react'

import { ITEM_TYPES } from '#/db/schema'
import type { ItemType } from '#/db/schema'
import { CATEGORIES } from '#/lib/categories'
import { cn } from '#/lib/utils'
import { addItem } from '#/server/items'
import { getMyLists } from '#/server/lists'
import {
  fetchLinkPreview,
  searchBooks,
  searchPlaces,
  searchTmdb,
} from '#/server/lookup'
import type { LookupResult } from '#/server/lookup'
import { Button, Field, Input, Modal, Spinner, Textarea } from '#/components/ui'

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function SearchPicker({
  type,
  onPick,
}: {
  type: ItemType
  onPick: (r: LookupResult) => void
}) {
  const config = CATEGORIES[type]
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query.trim(), 350)
  const isPlaces =
    config.lookup === 'places' || config.lookup === 'places-restaurant'

  const results = useQuery({
    queryKey: ['lookup', config.lookup, debouncedQuery],
    queryFn: (): Promise<Array<LookupResult>> => {
      if (config.lookup === 'books')
        return searchBooks({ data: debouncedQuery })
      if (isPlaces)
        return searchPlaces({
          data: {
            query: debouncedQuery,
            kind:
              config.lookup === 'places-restaurant' ? 'restaurant' : 'place',
          },
        })
      const kind = config.lookup === 'tmdb-movie' ? 'movie' : 'tv'
      return searchTmdb({ data: { query: debouncedQuery, kind } })
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000,
  })

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={config.lookupHint}
          autoFocus
          className="pl-10"
        />
      </div>

      {results.isFetching && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {results.data && results.data.length > 0 && (
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {results.data.map((r, i) => (
            <li key={i}>
              <button
                onClick={() => onPick(r)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-(--radius-control) p-2 text-left hover:bg-card-deep"
              >
                {r.imageUrl ? (
                  <img
                    src={r.imageUrl}
                    alt=""
                    className="h-14 w-10 shrink-0 rounded-md border border-line object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-card-deep">
                    {isPlaces && <MapPin className="size-4 text-ink-faint" />}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium">{r.title}</p>
                  <p className="truncate text-[13px] text-ink-faint">
                    {[
                      r.metadata.year,
                      r.metadata.author,
                      r.metadata.address,
                      r.metadata.rating && `★ ${r.metadata.rating}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {results.isError && !results.isFetching && (
        <p className="py-6 text-center text-sm text-danger">
          {isPlaces
            ? "Couldn't reach the places service — try again, or add it manually below"
            : "Lookup failed — try again, or add it manually below"}
        </p>
      )}

      {results.data?.length === 0 && !results.isFetching && (
        <p className="py-6 text-center text-sm text-ink-faint">
          Nothing found — add it manually below
        </p>
      )}
    </div>
  )
}

function LinkPicker({
  type,
  onPick,
}: {
  type: ItemType
  onPick: (r: LookupResult) => void
}) {
  const config = CATEGORIES[type]
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

  const fetchPreview = useMutation({
    mutationFn: () => fetchLinkPreview({ data: url.trim() }),
    onSuccess: (r) => {
      if (r) onPick(r)
      else setFailed(true)
    },
    onError: () => setFailed(true),
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setFailed(false)
        fetchPreview.mutate()
      }}
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            type="url"
            autoFocus
            className="pl-10"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={!url.trim() || fetchPreview.isPending}
        >
          {fetchPreview.isPending ? (
            <Spinner className="border-accent-ink" />
          ) : (
            'Fetch'
          )}
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-ink-faint">{config.lookupHint}</p>
      {failed && (
        <p className="mt-2 text-sm text-danger">
          Couldn't read that page — fill in the details below instead
        </p>
      )}
    </form>
  )
}

export function AddItemDialog({
  open,
  onClose,
  listId,
  listType,
}: {
  open: boolean
  onClose: () => void
  /** Omit both to add from anywhere — the item lands on the default shelf
   *  for its type unless the user picks a specific one. */
  listId?: string
  listType?: ItemType | 'mixed'
}) {
  const queryClient = useQueryClient()
  const fixedType = listType && listType !== 'mixed' ? listType : null
  const [type, setType] = useState<ItemType | null>(fixedType)
  const [manual, setManual] = useState(false)
  const [prefilled, setPrefilled] = useState(false)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [link, setLink] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [metadata, setMetadata] = useState<Record<string, string>>({})
  // '' = the default shelf for the picked type.
  const [targetListId, setTargetListId] = useState('')

  // Global mode offers a shelf picker; list mode is already scoped.
  const globalMode = !listId
  const { data: myLists } = useQuery({
    queryKey: ['lists'],
    queryFn: () => getMyLists(),
    enabled: globalMode && open,
  })
  const shelfChoices = (myLists ?? []).filter(
    (l) => !l.isDefault && (l.type === type || l.type === 'mixed'),
  )

  function reset() {
    setType(fixedType)
    setManual(false)
    setPrefilled(false)
    setTitle('')
    setNotes('')
    setLink('')
    setImageUrl('')
    setMetadata({})
    setTargetListId('')
  }

  function close() {
    reset()
    onClose()
  }

  function pick(r: LookupResult) {
    setTitle(r.title)
    setLink(r.link ?? '')
    setImageUrl(r.imageUrl ?? '')
    setMetadata(r.metadata)
    setPrefilled(true)
  }

  const save = useMutation({
    mutationFn: () =>
      addItem({
        data: {
          listId: listId ?? (targetListId || undefined),
          type: type!,
          title,
          notes: notes || undefined,
          link: link || undefined,
          imageUrl: imageUrl || undefined,
          metadata: Object.keys(metadata).length ? metadata : undefined,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ['list', result.listId],
      })
      await queryClient.invalidateQueries({ queryKey: ['lists'] })
      close()
    },
  })

  const showForm = manual || prefilled
  const config = type ? CATEGORIES[type] : null

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        !type
          ? 'What kind of thing?'
          : showForm
            ? prefilled
              ? 'Check the details'
              : `Add a ${config!.itemNoun}`
            : `Add a ${config!.itemNoun}`
      }
      wide
    >
      {/* Step 1 — mixed lists pick a type first */}
      {!type && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ITEM_TYPES.map((t) => {
            const c = CATEGORIES[t]
            const Icon = c.icon
            return (
              <button
                key={t}
                onClick={() => setType(t)}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-(--radius-card) border border-line bg-card-deep px-3 py-5 transition-colors hover:border-ink-faint"
              >
                <Icon className={cn('size-6', c.textClass)} />
                <span className="text-sm font-medium">{c.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Step 2 — find it */}
      {type && !showForm && (
        <div className="space-y-4">
          {config!.lookup === 'url' ? (
            <LinkPicker type={type} onPick={pick} />
          ) : (
            <SearchPicker type={type} onPick={pick} />
          )}

          <div className="flex items-center justify-between pt-2">
            {!fixedType ? (
              <Button variant="ghost" onClick={() => setType(null)}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button variant="ghost" onClick={() => setManual(true)}>
              <PenLine className="size-4" />
              Add manually
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — confirm / edit */}
      {type && showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
          className="space-y-4"
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="h-28 w-auto rounded-lg border border-line object-cover"
            />
          )}
          {metadata.address && (
            <p className="flex items-center gap-1.5 text-[13px] text-ink-faint">
              <MapPin className="size-3.5 shrink-0" />
              {metadata.address}
            </p>
          )}
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus={!prefilled}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Who recommended it, what to order, why it's on the list…"
            />
          </Field>
          {globalMode && shelfChoices.length > 0 && (
            <Field label="Shelf">
              <select
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
                className="w-full cursor-pointer rounded-(--radius-control) border border-line bg-card-deep px-3.5 py-2.5 text-[15px] text-ink transition-colors focus:border-accent focus:outline-none"
              >
                <option value="">{CATEGORIES[type].label} — default</option>
                {shelfChoices.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.memberCount > 1 ? ' (shared)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {manual && (
            <>
              <Field label="Link (optional)">
                <Input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  type="url"
                  placeholder="https://…"
                />
              </Field>
              <Field label="Image URL (optional)">
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  type="url"
                  placeholder="https://…"
                />
              </Field>
            </>
          )}

          {save.isError && (
            <p className="text-sm text-danger">{save.error.message}</p>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPrefilled(false)
                setManual(false)
                setTitle('')
                setImageUrl('')
                setLink('')
                setMetadata({})
              }}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={save.isPending}
              className="px-6"
            >
              Add to shelf
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
