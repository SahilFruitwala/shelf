import { useEffect, useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bookmark, Check, Plus, Trash2 } from 'lucide-react'

import { cn } from '#/lib/utils'
import {
  formatDay,
  preferredUnit,
  rememberUnit,
  summarizeSets,
} from '#/lib/workouts'
import type { WeightUnit } from '#/db/schema'
import {
  addSessionExercise,
  addSet,
  deleteSet,
  deleteWorkout,
  getWorkout,
  removeSessionExercise,
  saveSessionAsTemplate,
  updateSet,
  updateWorkout,
} from '#/server/workouts'
import type { WorkoutDetail, WorkoutSummary } from '#/server/workouts'
import { ExercisePicker } from '#/components/exercise-picker'
import { Button, ConfirmDialog, Input, Modal, Textarea } from '#/components/ui'
import { WorkoutSessionSkeleton } from '#/components/skeletons'

export const Route = createFileRoute('/_app/workouts/$sessionId')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['workout', params.sessionId],
      queryFn: () => getWorkout({ data: params.sessionId }),
    })
  },
  component: WorkoutSessionPage,
  pendingComponent: WorkoutSessionSkeleton,
})

type ExerciseRow = WorkoutDetail['exercises'][number]
type SetRowData = ExerciseRow['sets'][number]

/** One set. Values live locally while typing and save on blur, so a refetch
 *  mid-keystroke can't yank the number out from under the cursor. */
function SetRow({
  set,
  index,
  onChanged,
  onValueSaved,
}: {
  set: SetRowData
  index: number
  /** Refetches the session — for changes the page's own totals depend on. */
  onChanged: () => void
  /** Cheap variant for weight/reps/unit edits: the DB is updated and this row
   *  already shows the new value, so refetching the session would only cost a
   *  round trip per blur while you tab through a workout. */
  onValueSaved: () => void
}) {
  const [weight, setWeight] = useState(set.weight?.toString() ?? '')
  const [reps, setReps] = useState(set.reps?.toString() ?? '')
  const [unit, setUnit] = useState<WeightUnit>(set.unit)
  const [done, setDone] = useState(set.done)

  // Re-seed when the row itself changes (add/remove reorders the list).
  useEffect(() => {
    setWeight(set.weight?.toString() ?? '')
    setReps(set.reps?.toString() ?? '')
    setUnit(set.unit)
    setDone(set.done)
  }, [set.id, set.weight, set.reps, set.unit, set.done])

  const saveValues = useMutation({
    mutationFn: (changes: Parameters<typeof updateSet>[0]['data']) =>
      updateSet({ data: changes }),
    onSuccess: onValueSaved,
  })

  // Ticking a set moves the "12/15 sets done" counter above, so this one does
  // need the session back.
  const saveDone = useMutation({
    mutationFn: (next: boolean) =>
      updateSet({ data: { setId: set.id, done: next } }),
    onSuccess: onChanged,
  })

  const remove = useMutation({
    mutationFn: () => deleteSet({ data: set.id }),
    onSuccess: onChanged,
  })

  function commit() {
    saveValues.mutate({
      setId: set.id,
      weight: weight === '' ? null : Number(weight),
      reps: reps === '' ? null : Number(reps),
      unit,
    })
  }

  const numberClass =
    'w-full rounded-(--radius-control) border border-line bg-card-deep px-2 py-2 text-center text-[15px] tabular-nums text-ink transition-colors placeholder:text-ink-faint focus:border-accent focus:outline-none'

  return (
    <li
      className={cn(
        'grid grid-cols-[1.5rem_1fr_auto_1fr_2.25rem_1.75rem] items-center gap-1.5',
        done && 'opacity-60',
      )}
    >
      <span className="text-center text-[13px] font-medium text-ink-faint">
        {index + 1}
      </span>

      <span className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          aria-label={`Set ${index + 1} weight`}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={commit}
          placeholder="—"
          className={numberClass}
        />
        <button
          type="button"
          onClick={() => {
            const next = unit === 'kg' ? 'lb' : 'kg'
            setUnit(next)
            rememberUnit(next)
            saveValues.mutate({ setId: set.id, unit: next })
          }}
          title="Switch unit"
          className="shrink-0 cursor-pointer text-[12px] font-semibold text-ink-faint hover:text-ink"
        >
          {unit}
        </button>
      </span>

      <span className="text-[13px] text-ink-faint">×</span>

      <input
        type="number"
        inputMode="numeric"
        min={0}
        aria-label={`Set ${index + 1} reps`}
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={commit}
        placeholder="reps"
        className={numberClass}
      />

      <button
        type="button"
        aria-label={`Mark set ${index + 1} ${done ? 'not done' : 'done'}`}
        aria-pressed={done}
        onClick={() => {
          const next = !done
          setDone(next)
          saveDone.mutate(next)
        }}
        className={cn(
          'flex size-8 cursor-pointer items-center justify-center rounded-full border transition-colors',
          done
            ? 'border-cat-exercise bg-cat-exercise/15 text-cat-exercise'
            : 'border-line text-ink-faint hover:border-ink-faint hover:text-ink',
        )}
      >
        <Check className="size-4" />
      </button>

      <button
        type="button"
        onClick={() => remove.mutate()}
        aria-label={`Delete set ${index + 1}`}
        className="cursor-pointer justify-self-center rounded-full p-1 text-ink-faint hover:text-danger"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  )
}

function ExerciseBlock({
  exercise,
  onChanged,
  onValueSaved,
}: {
  exercise: ExerciseRow
  onChanged: () => void
  onValueSaved: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  const add = useMutation({
    mutationFn: () => addSet({ data: exercise.id }),
    onSuccess: onChanged,
  })
  const remove = useMutation({
    mutationFn: () => removeSessionExercise({ data: exercise.id }),
    onSuccess: onChanged,
  })

  const lastTime = summarizeSets(exercise.lastTime)

  return (
    <section className="rounded-(--radius-card) bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold leading-snug">
            {exercise.name}
          </h2>
          {lastTime && (
            <p className="mt-0.5 text-[12px] text-ink-faint">
              Last time{' '}
              {exercise.lastTimeDate
                ? `(${formatDay(exercise.lastTimeDate)})`
                : ''}{' '}
              — {lastTime}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Remove ${exercise.name}`}
          className="shrink-0 cursor-pointer rounded-full p-1.5 text-ink-faint hover:bg-card-deep hover:text-danger"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {exercise.sets.map((set, i) => (
          <SetRow
            key={set.id}
            set={set}
            index={i}
            onChanged={onChanged}
            onValueSaved={onValueSaved}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={() => add.mutate()}
        disabled={add.isPending}
        className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-(--radius-control) border border-dashed border-line py-2 text-[13px] font-medium text-ink-soft hover:border-ink-faint hover:text-ink disabled:opacity-50"
      >
        <Plus className="size-3.5" />
        Add set
      </button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate()}
        busy={remove.isPending}
        destructive
        title={`Remove ${exercise.name}?`}
        description="Its sets go with it."
        confirmLabel="Remove"
      />
    </section>
  )
}

function SaveTemplateDialog({
  open,
  onClose,
  sessionId,
  defaultName,
}: {
  open: boolean
  onClose: () => void
  sessionId: string
  defaultName: string
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  const save = useMutation({
    mutationFn: () => saveSessionAsTemplate({ data: { sessionId, name } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workout-templates'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Save as routine">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        className="space-y-5"
      >
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Today's exercises become a routine you can start with one tap. Targets
          come from your heaviest set of each.
        </p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Push day"
          required
          data-autofocus
        />
        {save.isError && (
          <p className="text-sm text-danger">{save.error.message}</p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={save.isPending || !name.trim()}
          className="w-full py-3"
        >
          {save.isPending ? 'Saving…' : 'Save routine'}
        </Button>
      </form>
    </Modal>
  )
}

function WorkoutSessionPage() {
  const { sessionId } = Route.useParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: workout } = useQuery({
    queryKey: ['workout', sessionId],
    queryFn: () => getWorkout({ data: sessionId }),
  })

  const [savingTemplate, setSavingTemplate] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!workout) return
    setName(workout.name)
    setNotes(workout.notes ?? '')
  }, [workout?.id, workout?.name, workout?.notes])

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workout', sessionId] }),
      queryClient.invalidateQueries({ queryKey: ['workouts'] }),
    ])
  }

  /** Set totals on the history list went stale, but nothing on screen shows
   *  them — mark it and let the list refetch when it next mounts. */
  function markListStale() {
    void queryClient.invalidateQueries({
      queryKey: ['workouts'],
      refetchType: 'none',
    })
  }

  const patch = useMutation({
    mutationFn: (changes: { name?: string; date?: string; notes?: string }) =>
      updateWorkout({ data: { sessionId, ...changes } }),
    onSuccess: () => refresh(),
  })

  const addExercise = useMutation({
    mutationFn: (picked: { name: string; slug: string | null }) =>
      addSessionExercise({
        data: { sessionId, ...picked, unit: preferredUnit() },
      }),
    onSuccess: () => refresh(),
  })

  const remove = useMutation({
    mutationFn: () => deleteWorkout({ data: sessionId }),
    onSuccess: async () => {
      // Deliberately not refresh(). That invalidated ['workout', sessionId],
      // which is *active* while this page is mounted, so it fired a refetch of
      // the row just deleted — a whole request guaranteed to 404 — and then
      // the navigate's loader refetched the list on top. Against a DB ~55ms
      // away those round trips are what made deleting feel stuck. We already
      // know what changed: drop the row from the cached list and go, then
      // remove the dead detail entry once nothing observes it.
      queryClient.setQueryData<Array<WorkoutSummary>>(['workouts'], (old) =>
        old?.filter((w) => w.id !== sessionId),
      )
      await router.navigate({ to: '/workouts' })
      queryClient.removeQueries({ queryKey: ['workout', sessionId] })
    },
  })

  if (!workout) return <WorkoutSessionSkeleton />

  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0)
  const doneSets = workout.exercises.reduce(
    (n, e) => n + e.sets.filter((s) => s.done).length,
    0,
  )

  return (
    <main className="mx-auto max-w-2xl">
      <Link
        to="/workouts"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        All workouts
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name !== workout.name)
                patch.mutate({ name: name.trim() })
            }}
            aria-label="Workout name"
            className="text-hero w-full min-w-0 border-none bg-transparent font-display text-3xl font-bold text-ink outline-none focus:underline focus:decoration-line focus:underline-offset-8"
          />
          <div className="mt-2 flex items-center gap-3">
            <input
              type="date"
              value={workout.date}
              onChange={(e) =>
                e.target.value && patch.mutate({ date: e.target.value })
              }
              aria-label="Workout date"
              className="cursor-pointer rounded-(--radius-control) border border-line bg-card-deep px-2.5 py-1 text-[13px] text-ink-soft focus:border-accent focus:outline-none"
            />
            <span className="text-[13px] text-ink-faint">
              {formatDay(workout.date)}
              {totalSets > 0 && ` · ${doneSets}/${totalSets} sets done`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="quiet"
            onClick={() => setSavingTemplate(true)}
            disabled={workout.exercises.length === 0}
          >
            <Bookmark className="size-3.5" />
            Save as routine
          </Button>
          <Button
            variant="ghost"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete workout"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {workout.exercises.map((exercise) => (
          <ExerciseBlock
            key={exercise.id}
            exercise={exercise}
            onChanged={refresh}
            onValueSaved={markListStale}
          />
        ))}
      </div>

      <div className="mt-4 rounded-(--radius-card) border border-dashed border-line p-4">
        <p className="mb-2 text-[13px] font-medium text-ink-soft">
          {workout.exercises.length === 0
            ? 'What did you do?'
            : 'Add another exercise'}
        </p>
        <ExercisePicker onPick={(picked) => addExercise.mutate(picked)} />
      </div>

      <div className="mt-6">
        <label
          htmlFor="workout-notes"
          className="mb-1.5 block text-[13px] font-medium text-ink-soft"
        >
          Notes
        </label>
        <Textarea
          id="workout-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (workout.notes ?? '')) patch.mutate({ notes })
          }}
          rows={2}
          placeholder="Felt strong, bumped the bench…"
        />
      </div>

      <SaveTemplateDialog
        open={savingTemplate}
        onClose={() => setSavingTemplate(false)}
        sessionId={sessionId}
        defaultName={workout.name}
      />

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => remove.mutate()}
        busy={remove.isPending}
        destructive
        title="Delete this workout?"
        description="Every exercise and set logged on this day goes with it."
        confirmLabel="Delete workout"
      />
    </main>
  )
}
