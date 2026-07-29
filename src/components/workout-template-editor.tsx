import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GripVertical, Trash2 } from 'lucide-react'

import { preferredUnit, rememberUnit } from '#/lib/workouts'
import type { WeightUnit } from '#/db/schema'
import { createTemplate, updateTemplate } from '#/server/workouts'
import type { ExerciseInput, TemplateWithExercises } from '#/server/workouts'
import { ExercisePicker } from '#/components/exercise-picker'
import { Button, Field, Input, Modal, Textarea } from '#/components/ui'

interface DraftExercise extends ExerciseInput {
  key: string
  targetSets: number
  unit: WeightUnit
}

function toDraft(e: TemplateWithExercises['exercises'][number]): DraftExercise {
  return {
    key: e.id,
    name: e.name,
    slug: e.slug,
    targetSets: e.targetSets,
    targetReps: e.targetReps,
    targetWeight: e.targetWeight,
    unit: e.unit,
  }
}

/** Small number cell — empty means "not planned", so `null` round-trips. */
function NumberCell({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: number | null | undefined
  onChange: (value: number | null) => void
  placeholder: string
  label: string
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      aria-label={label}
      value={value ?? ''}
      onChange={(e) =>
        onChange(e.target.value === '' ? null : Number(e.target.value))
      }
      placeholder={placeholder}
      className="w-full rounded-(--radius-control) border border-line bg-card-deep px-2 py-1.5 text-center text-[14px] text-ink transition-colors placeholder:text-ink-faint focus:border-accent focus:outline-none"
    />
  )
}

/** Create or edit a routine. Exercises carry target sets/reps/weight, which
 *  become the prefilled sets every time the routine is started. */
export function TemplateEditor({
  open,
  onClose,
  template,
}: {
  open: boolean
  onClose: () => void
  /** Omitted → creating a new routine. */
  template?: TemplateWithExercises
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [exercises, setExercises] = useState<Array<DraftExercise>>([])

  // Reset to the target routine each time the dialog is opened.
  useEffect(() => {
    if (!open) return
    setName(template?.name ?? '')
    setNotes(template?.notes ?? '')
    setExercises(template?.exercises.map(toDraft) ?? [])
  }, [open, template])

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        notes,
        exercises: exercises.map(({ key: _key, ...e }) => e),
      }
      if (template)
        await updateTemplate({ data: { templateId: template.id, ...payload } })
      else await createTemplate({ data: payload })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workout-templates'] })
      onClose()
    },
  })

  function patch(key: string, changes: Partial<DraftExercise>) {
    setExercises((prev) =>
      prev.map((e) => (e.key === key ? { ...e, ...changes } : e)),
    )
  }

  function move(index: number, delta: number) {
    setExercises((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={template ? 'Edit routine' : 'New routine'}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        className="space-y-5"
      >
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Push day, Legs, Full body…"
            required
            data-autofocus
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
            Exercises
          </span>

          {exercises.length > 0 && (
            <ul className="mb-3 space-y-2">
              {/* Header only makes sense once there's a row under it. */}
              <li className="grid grid-cols-[1fr_3.25rem_3.25rem_5.5rem_1.75rem] items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                <span />
                <span className="text-center">Sets</span>
                <span className="text-center">Reps</span>
                <span className="text-center">Weight</span>
                <span />
              </li>
              {exercises.map((ex, i) => (
                <li
                  key={ex.key}
                  className="grid grid-cols-[1fr_3.25rem_3.25rem_5.5rem_1.75rem] items-center gap-1.5"
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${ex.name} up`}
                        className="cursor-pointer text-ink-faint hover:text-ink disabled:opacity-30"
                      >
                        <GripVertical className="size-3.5" />
                      </button>
                    </span>
                    <span className="min-w-0 truncate text-[14px] font-medium">
                      {ex.name}
                    </span>
                  </span>
                  <NumberCell
                    label={`Sets of ${ex.name}`}
                    value={ex.targetSets}
                    placeholder="3"
                    onChange={(v) =>
                      patch(ex.key, { targetSets: Math.max(v ?? 1, 1) })
                    }
                  />
                  <NumberCell
                    label={`Reps of ${ex.name}`}
                    value={ex.targetReps}
                    placeholder="—"
                    onChange={(v) => patch(ex.key, { targetReps: v })}
                  />
                  <span className="flex items-center gap-1">
                    <NumberCell
                      label={`Weight for ${ex.name}`}
                      value={ex.targetWeight}
                      placeholder="—"
                      onChange={(v) => patch(ex.key, { targetWeight: v })}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const unit = ex.unit === 'kg' ? 'lb' : 'kg'
                        rememberUnit(unit)
                        patch(ex.key, { unit })
                      }}
                      className="shrink-0 cursor-pointer text-[12px] font-semibold text-ink-faint hover:text-ink"
                      title="Switch unit"
                    >
                      {ex.unit}
                    </button>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setExercises((prev) =>
                        prev.filter((e) => e.key !== ex.key),
                      )
                    }
                    aria-label={`Remove ${ex.name}`}
                    className="cursor-pointer justify-self-center rounded-full p-1 text-ink-faint hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <ExercisePicker
            onPick={(picked) =>
              setExercises((prev) => [
                ...prev,
                {
                  key: crypto.randomUUID(),
                  name: picked.name,
                  slug: picked.slug,
                  targetSets: 3,
                  targetReps: null,
                  targetWeight: null,
                  unit: preferredUnit(),
                },
              ])
            }
          />
        </div>

        <Field
          label="Notes"
          hint="Rest times, cues, anything you keep forgetting."
        >
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="90s rest between sets…"
          />
        </Field>

        {save.isError && (
          <p className="text-sm text-danger">{save.error.message}</p>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={save.isPending || !name.trim()}
          className="w-full py-3"
        >
          {save.isPending
            ? 'Saving…'
            : template
              ? 'Save routine'
              : 'Create routine'}
        </Button>
      </form>
    </Modal>
  )
}
