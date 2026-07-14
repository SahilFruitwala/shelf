import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ExternalLink,
  RotateCcw,
  ThumbsDown,
  Trash2,
} from 'lucide-react'

import type { Item } from '#/db/schema'
import { CATEGORIES, statusLabel } from '#/lib/categories'
import { cn } from '#/lib/utils'
import { deleteItem, setItemStatus, updateItem } from '#/server/items'
import { Button, Textarea } from '#/components/ui'

export function ItemCard({
  item,
  listId,
  showType,
  memberNames,
}: {
  item: Item
  listId: string
  showType: boolean
  memberNames: Map<string, string>
}) {
  const queryClient = useQueryClient()
  const config = CATEGORIES[item.type]
  const Icon = config.icon
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(item.notes ?? '')

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['list', listId] })
    await queryClient.invalidateQueries({ queryKey: ['lists'] })
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

  const done = item.status === 'done'
  const abandoned = item.status === 'abandoned'
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

  return (
    <article
      className={cn(
        'glow-card flex gap-4 rounded-(--radius-card) p-4',
        abandoned && 'opacity-60',
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
              {showType && (
                <span className={cn('font-medium', config.textClass)}>
                  {config.label}
                  {subtitle && ' · '}
                </span>
              )}
              {subtitle}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
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

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
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
                >
                  <ThumbsDown className="size-3.5" />
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
            <Button
              variant="ghost"
              className="px-2 py-1 text-[13px] hover:text-danger"
              onClick={() => {
                if (confirm(`Remove “${item.title}” from this shelf?`))
                  remove.mutate()
              }}
              title="Remove"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          {addedByName && (
            <span className="text-[12px] text-ink-faint">{addedByName}</span>
          )}
        </div>
      </div>
    </article>
  )
}
