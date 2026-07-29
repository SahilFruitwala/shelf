import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dumbbell, Plus, Search } from 'lucide-react'

import { cn } from '#/lib/utils'
import { browseExercises } from '#/server/lookup'
import { Input, Spinner } from '#/components/ui'

export interface PickedExercise {
  name: string
  slug: string | null
}

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** Search the public-domain exercise database, or type anything and keep it —
 *  the library is a convenience, never a gate on logging a lift. */
export function ExercisePicker({
  onPick,
  placeholder = 'Bench press, squat, lat pulldown…',
  autoFocus,
}: {
  onPick: (exercise: PickedExercise) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query.trim(), 250)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useQuery({
    queryKey: ['browse-exercises', debounced],
    queryFn: () => browseExercises({ data: debounced }),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  })

  function pick(exercise: PickedExercise) {
    onPick(exercise)
    setQuery('')
    inputRef.current?.focus()
  }

  const custom = query.trim()
  const exactMatch = results.data?.some(
    (e) => e.name.toLowerCase() === custom.toLowerCase(),
  )

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const first = results.data?.[0]
            if (first) pick({ name: first.name, slug: first.id })
            else if (custom) pick({ name: custom, slug: null })
          }}
          placeholder={placeholder}
          data-autofocus={autoFocus ? '' : undefined}
          className="pl-10"
        />
        {results.isFetching && (
          <Spinner className="absolute right-3.5 top-1/2 -translate-y-1/2" />
        )}
      </div>

      {custom.length >= 2 && (
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {results.data?.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                onClick={() => pick({ name: ex.name, slug: ex.id })}
                className="flex w-full cursor-pointer items-center gap-3 rounded-(--radius-control) p-1.5 text-left hover:bg-card-deep"
              >
                {ex.images[0] ? (
                  <img
                    src={ex.images[0]}
                    alt=""
                    loading="lazy"
                    className="size-10 shrink-0 rounded-md border border-line object-cover"
                  />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-card-deep">
                    <Dumbbell className="size-3.5 text-ink-faint" />
                  </div>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">
                    {ex.name}
                  </span>
                  <span className="block truncate text-[12px] text-ink-faint">
                    {[ex.primaryMuscles[0], ex.equipment]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}

          {!exactMatch && !results.isFetching && (
            <li>
              <button
                type="button"
                onClick={() => pick({ name: custom, slug: null })}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-(--radius-control) p-1.5 text-left hover:bg-card-deep',
                  results.data?.length ? 'border-t border-line pt-2.5' : '',
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed border-line">
                  <Plus className="size-4 text-ink-faint" />
                </span>
                <span className="min-w-0 text-[14px] text-ink-soft">
                  Add <span className="font-medium text-ink">“{custom}”</span>{' '}
                  as your own
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
