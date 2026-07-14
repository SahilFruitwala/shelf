import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, DoorOpen, Plus, Trash2, UserPlus } from 'lucide-react'

import type { ItemStatus } from '#/db/schema'
import { LIST_TYPE_CONFIG, CATEGORIES } from '#/lib/categories'
import { cn } from '#/lib/utils'
import { deleteList, getList, leaveList } from '#/server/lists'
import { AddItemDialog } from '#/components/add-item'
import { ItemCard } from '#/components/item-card'
import { ShareDialog } from '#/components/share-dialog'
import { Button } from '#/components/ui'

export const Route = createFileRoute('/_app/list/$listId')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['list', params.listId],
      queryFn: () => getList({ data: params.listId }),
    })
  },
  component: ListPage,
})

type StatusFilter = ItemStatus | 'all'

function ListPage() {
  const { listId } = Route.useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: list } = useQuery({
    queryKey: ['list', listId],
    queryFn: () => getList({ data: listId }),
  })

  const [adding, setAdding] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [filter, setFilter] = useState<StatusFilter>('all')

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

  if (!list) return null

  const config = LIST_TYPE_CONFIG[list.type]
  const memberNames = new Map(list.members.map((m) => [m.userId, m.name]))
  const showAddedBy = list.members.length > 1

  const toTryLabel =
    list.type === 'mixed' ? 'To try' : CATEGORIES[list.type].toTryLabel
  const doneLabel =
    list.type === 'mixed' ? 'Done' : CATEGORIES[list.type].doneLabel

  const counts = {
    all: list.items.length,
    to_try: list.items.filter((i) => i.status === 'to_try').length,
    done: list.items.filter((i) => i.status === 'done').length,
    abandoned: list.items.filter((i) => i.status === 'abandoned').length,
  }
  const visible =
    filter === 'all'
      ? list.items
      : list.items.filter((i) => i.status === filter)

  const filters: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'to_try', label: toTryLabel },
    { key: 'done', label: doneLabel },
    ...(counts.abandoned > 0
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
        <div>
          <p
            className={cn(
              'text-[13px] font-semibold uppercase tracking-wide',
              config.textClass,
            )}
          >
            {config.label}
          </p>
          <h1 className="text-hero mt-1 font-display text-3xl font-bold sm:text-4xl">
            {list.name}
          </h1>
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
          <Button variant="quiet" onClick={() => setSharing(true)}>
            <UserPlus className="size-4" />
            Share
          </Button>
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>

      {list.items.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer',
                filter === f.key
                  ? 'bg-ink text-bg'
                  : 'border border-line bg-card-deep text-ink-soft hover:text-ink',
              )}
            >
              {f.label}
              <span
                className={cn(
                  'ml-1.5',
                  filter === f.key ? 'opacity-60' : 'text-ink-faint',
                )}
              >
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
      )}

      {list.items.length === 0 ? (
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
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-[15px] text-ink-faint">
          Nothing matches this filter.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              listId={listId}
              showType={list.type === 'mixed'}
              memberNames={showAddedBy ? memberNames : new Map()}
            />
          ))}
        </div>
      )}

      <div className="mt-14 flex justify-center">
        {list.isDefault ? null : list.isOwner ? (
          <Button
            variant="danger"
            onClick={() => {
              if (
                confirm(
                  `Delete “${list.name}” and everything on it? This can't be undone.`,
                )
              )
                removeList.mutate()
            }}
          >
            <Trash2 className="size-4" />
            Delete shelf
          </Button>
        ) : (
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(`Leave “${list.name}”?`)) leave.mutate()
            }}
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
      />
      <ShareDialog
        open={sharing}
        onClose={() => setSharing(false)}
        listId={listId}
        joinCode={list.joinCode}
        members={list.members}
        isOwner={list.isOwner}
        myUserId={list.myUserId}
      />
    </main>
  )
}
