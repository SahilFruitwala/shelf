import type { WeightUnit } from '#/db/schema'

/** Local calendar day as YYYY-MM-DD. `toISOString()` would hand back the UTC
 *  day, which flips the date for anyone training late evening west of UTC. */
export function localDay(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "Today", "Yesterday", else "Mon 14 Jul" (year only when it isn't this one). */
export function formatDay(day: string): string {
  const today = localDay()
  if (day === today) return 'Today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (day === localDay(yesterday)) return 'Yesterday'

  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(y !== new Date().getFullYear() && { year: 'numeric' }),
  })
}

const UNIT_KEY = 'shelf:weight-unit'

/** Last unit the user logged in, so every new set doesn't need switching. */
export function preferredUnit(): WeightUnit {
  if (typeof localStorage === 'undefined') return 'kg'
  return localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg'
}

export function rememberUnit(unit: WeightUnit) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(UNIT_KEY, unit)
}

/** "60 kg × 8" — the compact way a set reads everywhere in the UI. */
export function formatSet(set: {
  weight: number | null
  reps: number | null
  unit: WeightUnit
}): string {
  const weight = set.weight != null ? `${set.weight} ${set.unit}` : null
  const reps = set.reps != null ? `${set.reps}` : null
  if (weight && reps) return `${weight} × ${reps}`
  if (weight) return weight
  if (reps) return `${reps} reps`
  return '—'
}

/** Collapses repeated sets: 3 × (60 kg × 8) instead of the same line thrice. */
export function summarizeSets(
  sets: Array<{ weight: number | null; reps: number | null; unit: WeightUnit }>,
): string {
  if (sets.length === 0) return ''
  const parts: Array<{ label: string; count: number }> = []
  for (const set of sets) {
    const label = formatSet(set)
    const last = parts.at(-1)
    if (last?.label === label) last.count += 1
    else parts.push({ label, count: 1 })
  }
  return parts
    .map((p) => (p.count > 1 ? `${p.count} × ${p.label}` : p.label))
    .join(', ')
}
