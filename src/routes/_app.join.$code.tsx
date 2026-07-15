import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { LIST_TYPE_CONFIG } from '#/lib/categories'
import { cn } from '#/lib/utils'
import { joinList, previewJoin } from '#/server/lists'
import { Button, PageLoading } from '#/components/ui'

export const Route = createFileRoute('/_app/join/$code')({
  component: JoinPage,
})

function JoinPage() {
  const { code } = Route.useParams()
  const router = useRouter()

  const preview = useQuery({
    queryKey: ['join-preview', code],
    queryFn: () => previewJoin({ data: code }),
  })

  const join = useMutation({
    mutationFn: () => joinList({ data: code }),
    onSuccess: async ({ listId }) => {
      await router.navigate({
        to: '/list/$listId',
        params: { listId },
        replace: true,
      })
    },
  })

  if (preview.isPending) return <PageLoading label="Checking invite…" />

  if (!preview.data?.found) {
    return (
      <main className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">
          This invite link isn't valid
        </h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          It may have been turned off by the shelf's owner. Ask them for a new
          link.
        </p>
        <Button
          variant="primary"
          className="mt-6"
          onClick={() => router.navigate({ to: '/' })}
        >
          Go to your shelves
        </Button>
      </main>
    )
  }

  const info = preview.data
  const config = LIST_TYPE_CONFIG[info.type]
  const Icon = config.icon

  return (
    <main className="mx-auto max-w-md py-16 text-center">
      <button
        type="button"
        onClick={() => router.navigate({ to: '/' })}
        className="mb-8 inline-flex cursor-pointer items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Back to shelves
      </button>
      <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-card-deep ring-1 ring-line">
        <Icon className={cn('size-7', config.textClass)} />
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {info.name}
      </h1>
      <p className="mt-2 text-[15px] text-ink-soft">
        {info.ownerName} invited you to this shelf. Join to add and edit items
        together.
      </p>
      {join.isError && (
        <p className="mt-4 text-sm text-danger">{join.error.message}</p>
      )}
      <Button
        variant="primary"
        className="mt-6 px-8 py-2.5"
        disabled={join.isPending}
        onClick={() =>
          info.alreadyMember
            ? router.navigate({
                to: '/list/$listId',
                params: { listId: info.listId },
              })
            : join.mutate()
        }
      >
        {info.alreadyMember ? 'Open shelf' : 'Join shelf'}
      </Button>
    </main>
  )
}
