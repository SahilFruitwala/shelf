import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Users } from 'lucide-react'

import { LIST_TYPES } from '#/db/schema'
import type { ListType } from '#/db/schema'
import { LIST_TYPE_CONFIG } from '#/lib/categories'
import { cn } from '#/lib/utils'
import { createList, getMyLists } from '#/server/lists'
import { AddItemDialog } from '#/components/add-item'
import { HoverHighlight } from '#/components/aceternity'
import { Button, Field, Input, Modal } from '#/components/ui'

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
        <div className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-line bg-card-deep/50">
          <Icon className={cn('size-6 opacity-50', config.textClass)} />
        </div>
      ) : (
        images.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            loading="lazy"
            className="h-24 w-16 rounded-lg border border-line object-cover"
          />
        ))
      )}
    </div>
  )
}

function ListCard({ list }: { list: ListSummary }) {
  const config = LIST_TYPE_CONFIG[list.type]
  return (
    <Link
      to="/list/$listId"
      params={{ listId: list.id }}
      className="glow-card block h-full rounded-(--radius-card) p-4"
    >
      <CoverStrip images={list.coverImages} type={list.type} />
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
          <div className="grid grid-cols-2 gap-2">
            {LIST_TYPES.map((t) => {
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
              add it. Good for trips.
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

function HomePage() {
  const { data: lists = [] } = useQuery({
    queryKey: ['lists'],
    queryFn: () => getMyLists(),
  })
  const [creating, setCreating] = useState(false)
  const [adding, setAdding] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

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

      {lists.length === 0 ? (
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
              <h2 className="mb-4 mt-10 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
                Custom & shared shelves
              </h2>
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

      <NewListDialog open={creating} onClose={() => setCreating(false)} />
      <AddItemDialog open={adding} onClose={() => setAdding(false)} />
    </main>
  )
}
