import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dumbbell, Pencil, Play, Plus, Trash2 } from 'lucide-react'

import { cn } from '#/lib/utils'
import { formatDay, localDay } from '#/lib/workouts'
import {
  deleteTemplate,
  getMyTemplates,
  getMyWorkouts,
  startWorkout,
} from '#/server/workouts'
import type { TemplateWithExercises } from '#/server/workouts'
import { TemplateEditor } from '#/components/workout-template-editor'
import { Button, ConfirmDialog, SectionLabel, Spinner } from '#/components/ui'
import { WorkoutsPageSkeleton } from '#/components/skeletons'

export const Route = createFileRoute('/_app/workouts/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ['workouts'],
        queryFn: () => getMyWorkouts({ data: {} }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ['workout-templates'],
        queryFn: () => getMyTemplates(),
      }),
    ])
  },
  component: WorkoutsPage,
  pendingComponent: WorkoutsPageSkeleton,
})

function useStartWorkout() {
  const router = useRouter()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (templateId?: string) =>
      startWorkout({ data: { date: localDay(), templateId } }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['workouts'] })
      await router.navigate({
        to: '/workouts/$sessionId',
        params: { sessionId: id },
      })
    },
  })
}

function TemplateCard({
  template,
  onEdit,
}: {
  template: TemplateWithExercises
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const start = useStartWorkout()
  const [confirming, setConfirming] = useState(false)

  const remove = useMutation({
    mutationFn: () => deleteTemplate({ data: template.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workout-templates'] })
      setConfirming(false)
    },
  })

  return (
    <div className="flex h-full flex-col rounded-(--radius-card) bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-[17px] font-semibold leading-snug">
          {template.name}
        </h3>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${template.name}`}
            className="cursor-pointer rounded-full p-1.5 text-ink-faint hover:bg-card-deep hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${template.name}`}
            className="cursor-pointer rounded-full p-1.5 text-ink-faint hover:bg-card-deep hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <p className="mt-1 flex-1 text-[13px] leading-relaxed text-ink-soft">
        {template.exercises.length === 0 ? (
          <span className="text-ink-faint">No exercises yet</span>
        ) : (
          template.exercises.map((e) => e.name).join(' · ')
        )}
      </p>

      <Button
        variant="quiet"
        onClick={() => start.mutate(template.id)}
        disabled={start.isPending || template.exercises.length === 0}
        className="mt-4 w-full"
      >
        {start.isPending ? <Spinner /> : <Play className="size-3.5" />}
        Start
      </Button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate()}
        busy={remove.isPending}
        destructive
        title={`Delete “${template.name}”?`}
        description="The routine goes away. Workouts you already logged from it stay exactly as they are."
        confirmLabel="Delete routine"
      />
    </div>
  )
}

function WorkoutsPage() {
  const { data: workouts = [] } = useQuery({
    queryKey: ['workouts'],
    queryFn: () => getMyWorkouts({ data: {} }),
  })
  const { data: templates = [] } = useQuery({
    queryKey: ['workout-templates'],
    queryFn: () => getMyTemplates(),
  })

  const start = useStartWorkout()
  const [editing, setEditing] = useState<TemplateWithExercises | undefined>()
  const [editorOpen, setEditorOpen] = useState(false)

  function openEditor(template?: TemplateWithExercises) {
    setEditing(template)
    setEditorOpen(true)
  }

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div>
          <div className="flex items-center gap-2">
            <Dumbbell className="size-6 text-cat-exercise" />
            <h1 className="text-hero font-display text-3xl font-bold sm:text-4xl">
              Workouts
            </h1>
          </div>
          <p className="mt-1.5 text-[15px] text-ink-soft">
            {workouts.length === 0
              ? 'Log what you lifted, day by day.'
              : `${workouts.length} ${workouts.length === 1 ? 'day' : 'days'} logged`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" onClick={() => openEditor()}>
            New routine
          </Button>
          <Button
            variant="primary"
            onClick={() => start.mutate(undefined)}
            disabled={start.isPending}
          >
            {start.isPending ? <Spinner /> : <Plus className="size-4" />}
            Log a workout
          </Button>
        </div>
      </div>

      <section>
        <SectionLabel className="mb-3">Routines</SectionLabel>
        {templates.length === 0 ? (
          <div className="rounded-(--radius-card) border border-dashed border-line px-5 py-8 text-center">
            <p className="text-[15px] text-ink-soft">
              Save a routine once — “Push day”, “Legs” — and every workout
              starts prefilled with its exercises and weights.
            </p>
            <Button
              variant="quiet"
              onClick={() => openEditor()}
              className="mt-4"
            >
              <Plus className="size-4" />
              Build a routine
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={() => openEditor(t)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <SectionLabel className="mb-3">History</SectionLabel>
        {workouts.length === 0 ? (
          <p className="py-8 text-center text-[15px] text-ink-faint">
            Nothing logged yet — start a workout and it lands here.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-(--radius-card) bg-card">
            {workouts.map((w) => (
              <li key={w.id} className="border-b border-line last:border-b-0">
                <Link
                  to="/workouts/$sessionId"
                  params={{ sessionId: w.id }}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-card-deep"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span className="font-medium">{w.name}</span>
                      <span className="text-[13px] text-ink-faint">
                        {formatDay(w.date)}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-ink-soft">
                      {w.exerciseNames.length > 0
                        ? w.exerciseNames.join(' · ')
                        : 'Empty'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-[12px] text-ink-faint">
                    <p
                      className={cn(
                        w.doneSetCount > 0 && 'font-medium text-ink-soft',
                      )}
                    >
                      {w.doneSetCount}/{w.setCount} sets
                    </p>
                    {w.volumeKg > 0 && (
                      <p className="mt-0.5">
                        {w.volumeKg.toLocaleString()} kg total
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TemplateEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        template={editing}
      />
    </main>
  )
}
