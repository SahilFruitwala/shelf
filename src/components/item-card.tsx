import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ExternalLink,
  FolderInput,
  MapPin,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react'

import type { Item, ItemType } from '#/db/schema'
import { CATEGORIES, statusLabel } from '#/lib/categories'
import { cn, formatDistance, itemCoords, mapsDirectionsUrl } from '#/lib/utils'
import {
  deleteItem,
  moveItem,
  setItemStatus,
  updateItem,
} from '#/server/items'
import { getMyLists } from '#/server/lists'
import { isMultiTypeShelf } from '#/lib/list-types'
import { toggleReaction } from '#/server/reactions'
import { Button, ConfirmDialog, Field, Input, Modal, Textarea } from '#/components/ui'

/** Type-specific metadata fields exposed in the edit dialog. */
const META_FIELDS: Record<ItemType, Array<{ key: string; label: string }>> = {
  restaurant: [
    { key: 'cuisine', label: 'Cuisine' },
    { key: 'address', label: 'Address' },
    { key: 'price', label: 'Price' },
  ],
  movie: [{ key: 'year', label: 'Year' }],
  tv: [{ key: 'year', label: 'Year' }],
  book: [
    { key: 'author', label: 'Author' },
    { key: 'year', label: 'Year' },
  ],
  place: [{ key: 'address', label: 'Address' }],
  wishlist: [{ key: 'price', label: 'Price' }],
}

function EditItemDialog({
  item,
  open,
  onClose,
  onSaved,
  showGroup,
}: {
  item: Item
  open: boolean
  onClose: () => void
  onSaved: () => Promise<void>
  showGroup?: boolean
}) {
  const [title, setTitle] = useState(item.title)
  const [link, setLink] = useState(item.link ?? '')
  const [imageUrl, setImageUrl] = useState(item.imageUrl ?? '')
  const [meta, setMeta] = useState<Record<string, string>>(item.metadata ?? {})

  // Reset the draft whenever a fresh item is opened for editing.
  useEffect(() => {
    if (open) {
      setTitle(item.title)
      setLink(item.link ?? '')
      setImageUrl(item.imageUrl ?? '')
      setMeta(item.metadata ?? {})
    }
  }, [open, item])

  const save = useMutation({
    mutationFn: () => {
      // Drop blanked-out fields so they don't linger as empty strings.
      const cleanedMeta = Object.fromEntries(
        Object.entries(meta).filter(([, v]) => v.trim() !== ''),
      )
      return updateItem({
        data: {
          itemId: item.id,
          title,
          link,
          imageUrl,
          metadata: cleanedMeta,
        },
      })
    },
    onSuccess: async () => {
      onClose()
      await onSaved()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Edit details">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        className="space-y-4"
      >
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </Field>

        {META_FIELDS[item.type].map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              value={meta[f.key] ?? ''}
              onChange={(e) =>
                setMeta((m) => ({ ...m, [f.key]: e.target.value }))
              }
            />
          </Field>
        ))}

        {showGroup && (
          <Field
            label="Day or group"
            hint="For trip shelves — e.g. “Day 1”, “Saturday lunch”. Shows in itinerary view."
          >
            <Input
              value={meta.group ?? ''}
              onChange={(e) =>
                setMeta((m) => ({ ...m, group: e.target.value }))
              }
              placeholder="Day 1, Saturday brunch…"
            />
          </Field>
        )}

        <Field label="Link">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            type="url"
          />
        </Field>

        <Field label="Image URL">
          <Input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            type="url"
          />
        </Field>

        {save.isError && (
          <p className="text-sm text-danger">{save.error.message}</p>
        )}

        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={save.isPending || !title.trim()}
            className="flex-1"
          >
            Save changes
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function MoveItemDialog({
  item,
  open,
  onClose,
  onMoved,
}: {
  item: Item
  open: boolean
  onClose: () => void
  onMoved: () => Promise<void>
}) {
  const { data: allLists = [] } = useQuery({
    queryKey: ['lists'],
    queryFn: () => getMyLists(),
    enabled: open,
  })
  const targets = allLists.filter(
    (l) =>
      l.id !== item.listId &&
      (l.type === item.type || isMultiTypeShelf(l.type)),
  )

  const move = useMutation({
    mutationFn: (targetListId: string) =>
      moveItem({ data: { itemId: item.id, targetListId } }),
    onSuccess: async () => {
      onClose()
      await onMoved()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Move to another shelf">
      {targets.length === 0 ? (
        <p className="py-4 text-[15px] text-ink-soft">
          No other shelf can hold this — create a {CATEGORIES[item.type].label}{' '}
          or trip shelf first.
        </p>
      ) : (
        <ul className="space-y-1">
          {targets.map((l) => {
            const Icon = CATEGORIES[item.type].icon
            return (
              <li key={l.id}>
                <button
                  onClick={() => move.mutate(l.id)}
                  disabled={move.isPending}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-(--radius-control) border border-line bg-card-deep p-3 text-left transition-colors hover:border-ink-faint disabled:opacity-50"
                >
                  <Icon className="size-4 shrink-0 text-ink-faint" />
                  <span className="text-[15px] font-medium">{l.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {move.isError && (
        <p className="mt-3 text-sm text-danger">{move.error.message}</p>
      )}
    </Modal>
  )
}

function ItemMenu({
  onEdit,
  onMove,
  onRemove,
  directionsUrl,
}: {
  onEdit: () => void
  onMove: () => void
  onRemove: () => void
  directionsUrl?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        className="px-2 py-1 text-[13px]"
        onClick={() => setOpen((o) => !o)}
        title="More actions"
        aria-label="More actions"
        aria-expanded={open}
      >
        <MoreHorizontal className="size-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-(--radius-control) border border-line bg-card p-1 text-[14px] shadow-xl">
          <button
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-ink-soft hover:bg-card-deep hover:text-ink"
          >
            <Pencil className="size-3.5" />
            Edit details
          </button>
          <button
            onClick={() => {
              setOpen(false)
              onMove()
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-ink-soft hover:bg-card-deep hover:text-ink"
          >
            <FolderInput className="size-3.5" />
            Move to shelf
          </button>
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-ink-soft hover:bg-card-deep hover:text-ink"
            >
              <MapPin className="size-3.5" />
              Open in Maps
            </a>
          )}
          <button
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-danger hover:bg-card-deep"
          >
            <Trash2 className="size-3.5" />
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

export function ItemCard({
  item,
  listId,
  showType,
  memberNames,
  showGroup,
  reactions,
  myUserId,
  showReactions,
  distanceKm,
  selectable,
  selected,
  onToggleSelect,
  onShowOnMap,
  compact,
  mapActive,
}: {
  item: Item
  listId: string
  showType: boolean
  memberNames: Map<string, string>
  showGroup?: boolean
  reactions?: Array<{ userId: string; name: string }>
  myUserId?: string
  showReactions?: boolean
  distanceKm?: number | null
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onShowOnMap?: () => void
  /** Tighter row layout for map split view */
  compact?: boolean
  mapActive?: boolean
}) {
  const queryClient = useQueryClient()
  const config = CATEGORIES[item.type]
  const Icon = config.icon
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(item.notes ?? '')
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['list', listId] })
    await queryClient.invalidateQueries({ queryKey: ['lists'] })
    await queryClient.invalidateQueries({ queryKey: ['activity'] })
  }

  const setStatus = useMutation({
    mutationFn: (status: Item['status']) =>
      setItemStatus({ data: { itemId: item.id, status } }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: () => deleteItem({ data: item.id }),
    onSuccess: invalidate,
  })
  const saveNotes = useMutation({
    mutationFn: () =>
      updateItem({ data: { itemId: item.id, notes: notesDraft } }),
    onSuccess: async () => {
      setEditingNotes(false)
      await invalidate()
    },
  })
  const react = useMutation({
    mutationFn: () => toggleReaction({ data: item.id }),
    onSuccess: invalidate,
  })

  const done = item.status === 'done'
  const abandoned = item.status === 'abandoned'
  const groupLabel = item.metadata?.group?.trim()
  const coords = itemCoords(item.metadata)
  const directionsUrl = coords
    ? mapsDirectionsUrl(coords.lat, coords.lng, item.title)
    : undefined
  const iReacted = reactions?.some((r) => r.userId === myUserId) ?? false
  const otherReactors =
    reactions?.filter((r) => r.userId !== myUserId) ?? []
  const subtitle = [
    item.metadata?.year,
    item.metadata?.author,
    item.metadata?.address,
    item.metadata?.rating && `★ ${item.metadata.rating}`,
    item.metadata?.price,
  ]
    .filter(Boolean)
    .join(' · ')
  const addedByName = memberNames.get(item.addedBy)

  if (compact) {
    const meta = [subtitle, item.notes].filter(Boolean).join(' · ')
    return (
      <>
        <article
          role={onShowOnMap ? 'button' : undefined}
          tabIndex={onShowOnMap ? 0 : undefined}
          onClick={onShowOnMap}
          onKeyDown={
            onShowOnMap
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onShowOnMap()
                  }
                }
              : undefined
          }
          className={cn(
            'flex items-center gap-3 rounded-(--radius-control) border px-3 py-2.5 transition-colors',
            mapActive
              ? 'border-cat-trip/40 bg-cat-trip/10 ring-1 ring-cat-trip/20'
              : 'border-line bg-card hover:border-ink-faint/60',
            onShowOnMap && 'cursor-pointer',
            abandoned && 'opacity-60',
            selectable && selected && 'ring-2 ring-accent',
          )}
        >
          {selectable && (
            <label
              className="flex shrink-0 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelect}
                className="size-4 cursor-pointer accent-accent"
                aria-label={`Select ${item.title}`}
              />
            </label>
          )}
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              className="size-11 shrink-0 rounded-lg border border-line object-cover"
            />
          ) : (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-card-deep">
              <Icon className={cn('size-4', config.textClass)} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3
                className={cn(
                  'truncate font-medium text-[15px] leading-snug',
                  done && 'line-through decoration-ink-faint',
                )}
              >
                {item.title}
              </h3>
              {!done && !abandoned && (
                <span
                  className={cn(
                    'shrink-0 text-[10px] font-semibold uppercase tracking-wide',
                    config.textClass,
                  )}
                >
                  {statusLabel(item.type, item.status)}
                </span>
              )}
            </div>
            {meta && (
              <p className="mt-0.5 truncate text-[12px] text-ink-faint">{meta}</p>
            )}
          </div>
          <div
            className="flex shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <ItemMenu
              onEdit={() => setEditing(true)}
              onMove={() => setMoving(true)}
              onRemove={() => setConfirmRemove(true)}
              directionsUrl={directionsUrl}
            />
          </div>
        </article>

        <EditItemDialog
          item={item}
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={invalidate}
          showGroup={showGroup}
        />
        <MoveItemDialog
          item={item}
          open={moving}
          onClose={() => setMoving(false)}
          onMoved={invalidate}
        />
        <ConfirmDialog
          open={confirmRemove}
          onClose={() => setConfirmRemove(false)}
          onConfirm={() => {
            remove.mutate()
            setConfirmRemove(false)
          }}
          title="Remove from shelf?"
          description={`“${item.title}” will be removed from this shelf. You can always add it again later.`}
          confirmLabel="Remove"
          destructive
          busy={remove.isPending}
        />
      </>
    )
  }

  return (
    <article
      className={cn(
        'glow-card flex gap-4 rounded-(--radius-card) p-4',
        abandoned && 'opacity-60',
        selectable && selected && 'ring-2 ring-accent',
      )}
    >
      {selectable && (
        <label className="flex shrink-0 cursor-pointer items-start pt-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="size-4 cursor-pointer accent-accent"
            aria-label={`Select ${item.title}`}
          />
        </label>
      )}
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className={cn(
            'h-24 w-16 shrink-0 rounded-lg border border-line object-cover',
            done && 'saturate-50',
          )}
        />
      ) : (
        <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg border border-line bg-card-deep">
          <Icon className={cn('size-5', config.textClass)} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3
              className={cn(
                'font-display text-[17px] font-semibold leading-snug',
                done && 'line-through decoration-1 decoration-ink-faint',
              )}
            >
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
              {showGroup && groupLabel && (
                <span className="mr-1.5 inline-flex items-center rounded-full bg-card-deep px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                  {groupLabel}
                </span>
              )}
              {showType && (
                <span className={cn('font-medium', config.textClass)}>
                  {config.label}
                  {subtitle && ' · '}
                </span>
              )}
              {subtitle}
              {distanceKm != null && (
                <span>
                  {subtitle ? ' · ' : ''}
                  <MapPin className="mr-0.5 inline size-3" />
                  {formatDistance(distanceKm)}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-start gap-1">
            {onShowOnMap && (
              <button
                type="button"
                onClick={onShowOnMap}
                title="Show on map"
                className="cursor-pointer rounded-full border border-line bg-card-deep p-1.5 text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
              >
                <MapPin className="size-3.5" />
              </button>
            )}
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                done
                  ? cn(config.bgClass, 'text-white dark:text-black/80')
                  : abandoned
                    ? 'bg-card-deep text-ink-faint'
                    : cn('bg-card-deep', config.textClass),
              )}
            >
              {statusLabel(item.type, item.status)}
            </span>
          </div>
        </div>

        {editingNotes ? (
          <div className="mt-2">
            <Textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={2}
              autoFocus
            />
            <div className="mt-1.5 flex gap-1.5">
              <Button
                variant="primary"
                className="px-3 py-1 text-[13px]"
                onClick={() => saveNotes.mutate()}
                disabled={saveNotes.isPending}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                className="px-3 py-1 text-[13px]"
                onClick={() => {
                  setEditingNotes(false)
                  setNotesDraft(item.notes ?? '')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditingNotes(true)}
            className={cn(
              'mt-1.5 block w-full text-left text-[14px] leading-relaxed cursor-pointer',
              item.notes
                ? 'text-ink-soft'
                : 'text-ink-faint italic hover:text-ink-soft',
            )}
          >
            {item.notes || 'Add a note…'}
          </button>
        )}

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex flex-wrap items-center gap-1">
            {item.status === 'to_try' ? (
              <>
                <Button
                  variant="quiet"
                  className="px-2.5 py-1 text-[13px]"
                  onClick={() => setStatus.mutate('done')}
                >
                  <Check className="size-3.5" />
                  {config.doneLabel}
                </Button>
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-[13px]"
                  onClick={() => setStatus.mutate('abandoned')}
                  title="Not for us"
                  aria-label="Not for us"
                >
                  <ThumbsDown className="size-3.5" />
                  <span className="sr-only sm:not-sr-only">Not for us</span>
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                className="px-2.5 py-1 text-[13px]"
                onClick={() => setStatus.mutate('to_try')}
              >
                <RotateCcw className="size-3.5" />
                {config.toTryLabel}
              </Button>
            )}
            {showReactions && item.addedBy !== myUserId && (
              <Button
                variant="ghost"
                className={cn(
                  'px-2 py-1 text-[13px]',
                  iReacted && 'text-accent',
                )}
                onClick={() => react.mutate()}
                disabled={react.isPending}
                title="Acknowledge a teammate's pick — not a rating"
              >
                <ThumbsUp
                  className={cn('size-3.5', iReacted && 'fill-current')}
                />
                <span className="hidden sm:inline">
                  {iReacted ? 'Noted' : 'Nice pick'}
                </span>
              </Button>
            )}
            <ItemMenu
              onEdit={() => setEditing(true)}
              onMove={() => setMoving(true)}
              onRemove={() => setConfirmRemove(true)}
              directionsUrl={directionsUrl}
            />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            {otherReactors.length > 0 && (
              <span className="text-[12px] text-ink-faint" title="Teammates who liked this pick">
                {otherReactors.length === 1
                  ? `${otherReactors[0]!.name.split(' ')[0]} liked this`
                  : `${otherReactors.length} liked this`}
              </span>
            )}
            {addedByName && (
              <span className="text-[12px] text-ink-faint">{addedByName}</span>
            )}
          </div>
        </div>
      </div>

      <EditItemDialog
        item={item}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={invalidate}
        showGroup={showGroup}
      />
      <MoveItemDialog
        item={item}
        open={moving}
        onClose={() => setMoving(false)}
        onMoved={invalidate}
      />
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          remove.mutate()
          setConfirmRemove(false)
        }}
        title="Remove from shelf?"
        description={`“${item.title}” will be removed from this shelf. You can always add it again later.`}
        confirmLabel="Remove"
        destructive
        busy={remove.isPending}
      />
    </article>
  )
}
