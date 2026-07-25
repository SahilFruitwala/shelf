import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Dumbbell, Search } from 'lucide-react'

import { cn } from '#/lib/utils'
import { browseExercises } from '#/server/lookup'
import type { ExerciseDetail } from '#/server/lookup'
import { Input, Spinner } from '#/components/ui'

export const Route = createFileRoute('/_app/exercises')({
  component: ExercisesPage,
})

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function MetaChip({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-card-deep px-2.5 py-0.5 text-[12px] font-medium text-ink-soft">
      {children}
    </span>
  )
}

function ExerciseCredit() {
  return (
    <p className="mt-8 text-center text-[12px] leading-relaxed text-ink-faint">
      Exercise data from{' '}
      <a
        href="https://github.com/yuhonas/free-exercise-db"
        target="_blank"
        rel="noreferrer"
        className="underline-offset-2 hover:text-ink-soft hover:underline"
      >
        free-exercise-db
      </a>
      {' '}
      (public domain / Unlicense).
    </p>
  )
}

function ExerciseDetailView({
  exercise,
  onBack,
}: {
  exercise: ExerciseDetail
  onBack: () => void
}) {
  const chips = [
    exercise.level,
    exercise.equipment,
    exercise.category,
    exercise.mechanic,
    exercise.force,
  ].filter(Boolean) as Array<string>

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Back to results
      </button>

      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {exercise.name}
      </h1>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <MetaChip key={c}>{c}</MetaChip>
          ))}
        </div>
      )}

      {(exercise.primaryMuscles.length > 0 ||
        exercise.secondaryMuscles.length > 0) && (
        <p className="mt-3 text-[14px] text-ink-soft">
          {exercise.primaryMuscles.length > 0 && (
            <>
              <span className="font-medium text-ink">Primary: </span>
              {exercise.primaryMuscles.join(', ')}
            </>
          )}
          {exercise.secondaryMuscles.length > 0 && (
            <>
              {exercise.primaryMuscles.length > 0 ? ' · ' : null}
              <span className="font-medium text-ink">Secondary: </span>
              {exercise.secondaryMuscles.join(', ')}
            </>
          )}
        </p>
      )}

      {exercise.images.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-3">
          {exercise.images.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={`${exercise.name} — step ${i + 1}`}
              className="size-40 rounded-(--radius-card) border border-line object-cover sm:size-48"
            />
          ))}
        </div>
      )}

      {exercise.instructions.length > 0 && (
        <div className="mt-6">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
            How to
          </h2>
          <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-[15px] leading-relaxed text-ink-soft">
            {exercise.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      <ExerciseCredit />
    </div>
  )
}

function ExercisesPage() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query.trim(), 300)
  const [selected, setSelected] = useState<ExerciseDetail | null>(null)

  const results = useQuery({
    queryKey: ['browse-exercises', debouncedQuery],
    queryFn: () => browseExercises({ data: debouncedQuery }),
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000,
  })

  // Clear selection when the query changes so results stay in sync.
  useEffect(() => {
    setSelected(null)
  }, [debouncedQuery])

  if (selected) {
    return (
      <div className="mx-auto max-w-xl py-4">
        <ExerciseDetailView
          exercise={selected}
          onBack={() => setSelected(null)}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl py-4">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-cat-exercise">
          <Dumbbell className="size-5" />
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Exercises
          </h1>
        </div>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Look up how to do a move — form photos and steps, nothing saved to
          your shelves.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name — deadlift, pull-up, squat…"
          autoFocus
          className="pl-10"
        />
      </div>

      {results.isFetching && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {results.isError && !results.isFetching && (
        <p className="py-10 text-center text-sm text-danger">
          Couldn’t load exercises — try again in a moment.
        </p>
      )}

      {results.data && results.data.length > 0 && !results.isFetching && (
        <ul className="mt-4 space-y-1">
          {results.data.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                onClick={() => setSelected(ex)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-(--radius-control) p-2 text-left hover:bg-card-deep"
              >
                {ex.images[0] ? (
                  <img
                    src={ex.images[0]}
                    alt=""
                    className="size-14 shrink-0 rounded-md border border-line object-cover"
                  />
                ) : (
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-line bg-card-deep">
                    <Dumbbell className="size-4 text-ink-faint" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium">{ex.name}</p>
                  <p className="truncate text-[13px] text-ink-faint">
                    {[ex.primaryMuscles[0], ex.equipment, ex.level]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {results.data?.length === 0 &&
        !results.isFetching &&
        debouncedQuery.length >= 2 && (
          <p className="py-10 text-center text-sm text-ink-faint">
            No exercises match “{debouncedQuery}”.
          </p>
        )}

      {debouncedQuery.length < 2 && (
        <p
          className={cn(
            'py-10 text-center text-sm text-ink-faint',
            query.trim().length > 0 && 'invisible',
          )}
        >
          Type at least 2 characters to search ~800 public-domain exercises.
        </p>
      )}

      <ExerciseCredit />
    </div>
  )
}
