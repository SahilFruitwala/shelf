import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import { getDb } from './db-access'
import { newId, requireUser } from './helpers'
import {
  WEIGHT_UNITS,
  workoutSessionExercises,
  workoutSessions,
  workoutSets,
  workoutTemplateExercises,
  workoutTemplates,
} from '#/db/schema'
import type { WeightUnit } from '#/db/schema'

// ---------- shared input shapes ----------

export interface ExerciseInput {
  name: string
  slug?: string | null
  targetSets?: number
  targetReps?: number | null
  targetWeight?: number | null
  unit?: WeightUnit
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function cleanUnit(unit: unknown): WeightUnit {
  return WEIGHT_UNITS.includes(unit as WeightUnit) ? (unit as WeightUnit) : 'kg'
}

/** Clamped so a fat-fingered "1000 sets" can't spawn a thousand rows. */
function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function cleanNumber(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > max) return null
  return n
}

function cleanExercises(list: Array<ExerciseInput>) {
  return list
    .map((e) => ({
      name: e.name.trim(),
      slug: e.slug?.trim() || null,
      targetSets: clampInt(e.targetSets ?? 3, 1, 20, 3),
      targetReps: cleanNumber(e.targetReps, 999),
      targetWeight: cleanNumber(e.targetWeight, 10_000),
      unit: cleanUnit(e.unit),
    }))
    .filter((e) => e.name.length > 0)
}

// ---------- ownership guards ----------

async function requireSession(sessionId: string) {
  const db = await getDb()
  const me = await requireUser()
  const session = await db.query.workoutSessions.findFirst({
    where: eq(workoutSessions.id, sessionId),
  })
  if (!session || session.userId !== me.id) throw new Error('Workout not found')
  return { db, me, session }
}

async function requireTemplate(templateId: string) {
  const db = await getDb()
  const me = await requireUser()
  const template = await db.query.workoutTemplates.findFirst({
    where: eq(workoutTemplates.id, templateId),
  })
  if (!template || template.userId !== me.id)
    throw new Error('Template not found')
  return { db, me, template }
}

// The remote DB is ~55ms away, so each of these guards is a visible chunk of
// every interaction. They join their way to the owning session in one query
// rather than walking the chain a row at a time.

/** Resolves a session exercise back to its session so ownership still holds. */
async function requireSessionExercise(sessionExerciseId: string) {
  const db = await getDb()
  const me = await requireUser()
  const rows = await db
    .select({
      exercise: workoutSessionExercises,
      session: workoutSessions,
    })
    .from(workoutSessionExercises)
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.sessionId),
    )
    .where(
      and(
        eq(workoutSessionExercises.id, sessionExerciseId),
        eq(workoutSessions.userId, me.id),
      ),
    )
    .limit(1)
  const row = rows.at(0)
  if (!row) throw new Error('Exercise not found')
  return { db, exercise: row.exercise, session: row.session }
}

/** Same idea one level deeper: set → exercise → session, in a single query. */
async function requireSet(setId: string) {
  const db = await getDb()
  const me = await requireUser()
  const rows = await db
    .select({ set: workoutSets })
    .from(workoutSets)
    .innerJoin(
      workoutSessionExercises,
      eq(workoutSessionExercises.id, workoutSets.sessionExerciseId),
    )
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.sessionId),
    )
    .where(and(eq(workoutSets.id, setId), eq(workoutSessions.userId, me.id)))
    .limit(1)
  return { db, set: rows.at(0)?.set ?? null }
}

// ---------- templates ----------

export const getMyTemplates = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDb()
    const me = await requireUser()

    const templates = await db
      .select()
      .from(workoutTemplates)
      .where(eq(workoutTemplates.userId, me.id))
      .orderBy(desc(workoutTemplates.createdAt))
    if (templates.length === 0) return []

    const exercises = await db
      .select()
      .from(workoutTemplateExercises)
      .where(
        inArray(
          workoutTemplateExercises.templateId,
          templates.map((t) => t.id),
        ),
      )
      .orderBy(asc(workoutTemplateExercises.position))

    return templates.map((t) => ({
      ...t,
      exercises: exercises.filter((e) => e.templateId === t.id),
    }))
  },
)

export type TemplateWithExercises = Awaited<
  ReturnType<typeof getMyTemplates>
>[number]

export const createTemplate = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      name: string
      notes?: string
      exercises: Array<ExerciseInput>
    }) => {
      const name = data.name.trim()
      if (!name) throw new Error('Give the routine a name')
      return {
        name,
        notes: data.notes?.trim() || null,
        exercises: cleanExercises(data.exercises),
      }
    },
  )
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()

    const id = newId()
    await db.insert(workoutTemplates).values({
      id,
      userId: me.id,
      name: data.name,
      notes: data.notes,
    })
    if (data.exercises.length > 0) {
      await db.insert(workoutTemplateExercises).values(
        data.exercises.map((e, i) => ({
          id: newId(),
          templateId: id,
          position: i,
          ...e,
        })),
      )
    }
    return { id }
  })

/** Replaces the whole exercise list — simpler than diffing, and the editor
 *  always submits the full routine anyway. */
export const updateTemplate = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      templateId: string
      name: string
      notes?: string
      exercises: Array<ExerciseInput>
    }) => {
      const name = data.name.trim()
      if (!name) throw new Error('Give the routine a name')
      return {
        templateId: data.templateId,
        name,
        notes: data.notes?.trim() || null,
        exercises: cleanExercises(data.exercises),
      }
    },
  )
  .handler(async ({ data }) => {
    const { db } = await requireTemplate(data.templateId)

    await db
      .update(workoutTemplates)
      .set({ name: data.name, notes: data.notes })
      .where(eq(workoutTemplates.id, data.templateId))

    await db
      .delete(workoutTemplateExercises)
      .where(eq(workoutTemplateExercises.templateId, data.templateId))

    if (data.exercises.length > 0) {
      await db.insert(workoutTemplateExercises).values(
        data.exercises.map((e, i) => ({
          id: newId(),
          templateId: data.templateId,
          position: i,
          ...e,
        })),
      )
    }
  })

export const deleteTemplate = createServerFn({ method: 'POST' })
  .validator((templateId: string) => templateId)
  .handler(async ({ data: templateId }) => {
    const db = await getDb()
    const me = await requireUser()
    await db
      .delete(workoutTemplates)
      .where(
        and(
          eq(workoutTemplates.id, templateId),
          eq(workoutTemplates.userId, me.id),
        ),
      )
  })

/** Turns a logged day into a reusable routine — target sets/reps/weight come
 *  from what was actually done. */
export const saveSessionAsTemplate = createServerFn({ method: 'POST' })
  .validator((data: { sessionId: string; name?: string }) => data)
  .handler(async ({ data }) => {
    const { db, me, session } = await requireSession(data.sessionId)

    const exercises = await db
      .select()
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.sessionId, session.id))
      .orderBy(asc(workoutSessionExercises.position))
    if (exercises.length === 0)
      throw new Error('Add an exercise before saving a template')

    const sets = await db
      .select()
      .from(workoutSets)
      .where(
        inArray(
          workoutSets.sessionExerciseId,
          exercises.map((e) => e.id),
        ),
      )
      .orderBy(asc(workoutSets.position))

    const templateId = newId()
    await db.insert(workoutTemplates).values({
      id: templateId,
      userId: me.id,
      name: data.name?.trim() || session.name,
    })

    await db.insert(workoutTemplateExercises).values(
      exercises.map((ex, i) => {
        const own = sets.filter((s) => s.sessionExerciseId === ex.id)
        // The heaviest set is the one worth repeating next time.
        const best = own.reduce<(typeof own)[number] | null>(
          (acc, s) => (!acc || (s.weight ?? 0) > (acc.weight ?? 0) ? s : acc),
          null,
        )
        return {
          id: newId(),
          templateId,
          name: ex.name,
          slug: ex.slug,
          position: i,
          targetSets: Math.max(own.length, 1),
          targetReps: best?.reps ?? null,
          targetWeight: best?.weight ?? null,
          unit: best?.unit ?? 'kg',
        }
      }),
    )

    return { id: templateId }
  })

// ---------- sessions ----------

const LOG_PAGE_SIZE = 30

/** Recent workout days with rolled-up counters for the log list. */
export const getMyWorkouts = createServerFn({ method: 'GET' })
  .validator((data?: { limit?: number }) => ({
    limit: clampInt(data?.limit ?? LOG_PAGE_SIZE, 1, 200, LOG_PAGE_SIZE),
  }))
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()

    const sessions = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, me.id))
      .orderBy(desc(workoutSessions.date), desc(workoutSessions.createdAt))
      .limit(data.limit)
    if (sessions.length === 0) return []

    const rows = await db
      .select({
        sessionId: workoutSessionExercises.sessionId,
        exerciseId: workoutSessionExercises.id,
        name: workoutSessionExercises.name,
        position: workoutSessionExercises.position,
        setId: workoutSets.id,
        reps: workoutSets.reps,
        weight: workoutSets.weight,
        unit: workoutSets.unit,
        done: workoutSets.done,
      })
      .from(workoutSessionExercises)
      .leftJoin(
        workoutSets,
        eq(workoutSets.sessionExerciseId, workoutSessionExercises.id),
      )
      .where(
        inArray(
          workoutSessionExercises.sessionId,
          sessions.map((s) => s.id),
        ),
      )
      .orderBy(asc(workoutSessionExercises.position), asc(workoutSets.position))

    return sessions.map((s) => {
      const own = rows.filter((r) => r.sessionId === s.id)
      const exerciseNames = [
        ...new Map(own.map((r) => [r.exerciseId, r.name])).values(),
      ]
      const sets = own.filter((r) => r.setId !== null)
      // Volume in kg so mixed-unit sessions still total to one number.
      const volume = sets.reduce(
        (n, r) =>
          n + (r.weight ?? 0) * (r.reps ?? 0) * (r.unit === 'lb' ? 0.4536 : 1),
        0,
      )
      return {
        ...s,
        exerciseNames,
        exerciseCount: exerciseNames.length,
        setCount: sets.length,
        doneSetCount: sets.filter((r) => r.done).length,
        volumeKg: Math.round(volume),
      }
    })
  })

export type WorkoutSummary = Awaited<ReturnType<typeof getMyWorkouts>>[number]

/** One session, fully expanded, with each exercise's previous outing attached
 *  so you can see what to beat without leaving the page. */
export const getWorkout = createServerFn({ method: 'GET' })
  .validator((sessionId: string) => sessionId)
  .handler(async ({ data: sessionId }) => {
    const { db, me, session } = await requireSession(sessionId)

    const exercises = await db
      .select()
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.sessionId, session.id))
      .orderBy(asc(workoutSessionExercises.position))

    const sets =
      exercises.length === 0
        ? []
        : await db
            .select()
            .from(workoutSets)
            .where(
              inArray(
                workoutSets.sessionExerciseId,
                exercises.map((e) => e.id),
              ),
            )
            .orderBy(asc(workoutSets.position))

    // Previous performance: the most recent earlier session that included an
    // exercise of the same name.
    //
    // Done in two steps on purpose. Joining sets in up front and picking the
    // newest per name in JS drags back every set you have ever logged for
    // these exercises — 4.7k rows to keep 6 after a year of training, growing
    // with every workout, serialized over the wire on each load. `row_number`
    // narrows it to one exercise row per name first, then only those sets are
    // fetched. Column names are written qualified: drizzle renders
    // `${table.col}` inside a raw `sql` template unqualified, which would bind
    // to the wrong table inside the subquery.
    const previous = new Map<
      string,
      { date: string; sets: Array<(typeof sets)[number]> }
    >()
    if (exercises.length > 0) {
      const names = [...new Set(exercises.map((e) => e.name))]
      const cutoff = Math.floor(session.createdAt.getTime() / 1000)

      const latest = await db.all<{ id: string; name: string; date: string }>(
        sql`
          select id, name, date from (
            select
              se.id as id,
              se.name as name,
              s.date as date,
              row_number() over (
                partition by se.name
                order by s.date desc, s.created_at desc
              ) as rn
            from workout_session_exercises se
            join workout_sessions s on s.id = se.session_id
            where s.user_id = ${me.id}
              and se.name in (${sql.join(
                names.map((n) => sql`${n}`),
                sql`, `,
              )})
              and (
                s.date < ${session.date}
                or (s.date = ${session.date} and s.created_at < ${cutoff})
              )
              and exists (
                select 1 from workout_sets ws
                where ws.session_exercise_id = se.id and ws.done = 1
              )
          )
          where rn = 1
        `,
      )

      if (latest.length > 0) {
        const priorSets = await db
          .select()
          .from(workoutSets)
          .where(
            and(
              inArray(
                workoutSets.sessionExerciseId,
                latest.map((r) => r.id),
              ),
              eq(workoutSets.done, true),
            ),
          )
          .orderBy(asc(workoutSets.position))

        for (const row of latest) {
          previous.set(row.name, {
            date: row.date,
            sets: priorSets.filter((s) => s.sessionExerciseId === row.id),
          })
        }
      }
    }

    return {
      ...session,
      exercises: exercises.map((ex) => {
        const prev = previous.get(ex.name)
        return {
          ...ex,
          sets: sets.filter((s) => s.sessionExerciseId === ex.id),
          lastTime:
            prev?.sets.map((s) => ({
              reps: s.reps,
              weight: s.weight,
              unit: s.unit,
            })) ?? [],
          lastTimeDate: prev?.date ?? null,
        }
      }),
    }
  })

export type WorkoutDetail = Awaited<ReturnType<typeof getWorkout>>

function today() {
  // Server-local date; the client sends its own day for anything user-facing.
  return new Date().toISOString().slice(0, 10)
}

/** Starts a day — blank, or prefilled from a template's exercises and targets. */
export const startWorkout = createServerFn({ method: 'POST' })
  .validator((data: { date?: string; name?: string; templateId?: string }) => ({
    date: data.date && DATE_RE.test(data.date) ? data.date : today(),
    name: data.name?.trim() || undefined,
    templateId: data.templateId || undefined,
  }))
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()

    let name = data.name ?? 'Workout'
    let templateExercises: Array<typeof workoutTemplateExercises.$inferSelect> =
      []

    if (data.templateId) {
      const { template } = await requireTemplate(data.templateId)
      name = data.name ?? template.name
      templateExercises = await db
        .select()
        .from(workoutTemplateExercises)
        .where(eq(workoutTemplateExercises.templateId, template.id))
        .orderBy(asc(workoutTemplateExercises.position))
    }

    const sessionId = newId()
    await db.insert(workoutSessions).values({
      id: sessionId,
      userId: me.id,
      date: data.date,
      name,
      templateId: data.templateId ?? null,
    })

    if (templateExercises.length > 0) {
      const exerciseRows = templateExercises.map((e, i) => ({
        id: newId(),
        sessionId,
        name: e.name,
        slug: e.slug,
        position: i,
      }))
      await db.insert(workoutSessionExercises).values(exerciseRows)

      // Prefill the planned sets, unticked — logging is then just adjusting
      // numbers and tapping done.
      const setRows = templateExercises.flatMap((e, i) =>
        Array.from({ length: e.targetSets }, (_, j) => ({
          id: newId(),
          sessionExerciseId: exerciseRows[i].id,
          position: j,
          reps: e.targetReps,
          weight: e.targetWeight,
          unit: e.unit,
          done: false,
        })),
      )
      if (setRows.length > 0) await db.insert(workoutSets).values(setRows)
    }

    return { id: sessionId }
  })

export const updateWorkout = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      sessionId: string
      name?: string
      date?: string
      notes?: string
    }) => {
      if (data.date !== undefined && !DATE_RE.test(data.date))
        throw new Error('Bad date')
      return data
    },
  )
  .handler(async ({ data }) => {
    const { db } = await requireSession(data.sessionId)
    const name = data.name?.trim()
    await db
      .update(workoutSessions)
      .set({
        ...(name && { name }),
        ...(data.date !== undefined && { date: data.date }),
        ...(data.notes !== undefined && { notes: data.notes.trim() || null }),
      })
      .where(eq(workoutSessions.id, data.sessionId))
  })

export const deleteWorkout = createServerFn({ method: 'POST' })
  .validator((sessionId: string) => sessionId)
  .handler(async ({ data: sessionId }) => {
    const db = await getDb()
    const me = await requireUser()
    // Ownership rides along in the WHERE, so this doesn't need a read first —
    // a row that isn't yours simply doesn't match. Saves a round trip on the
    // one action where the user is waiting to be taken somewhere else.
    await db
      .delete(workoutSessions)
      .where(
        and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, me.id)),
      )
  })

// ---------- exercises within a session ----------

export const addSessionExercise = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      sessionId: string
      name: string
      slug?: string | null
      sets?: number
      unit?: WeightUnit
    }) => {
      const name = data.name.trim()
      if (!name) throw new Error('Pick an exercise')
      return {
        sessionId: data.sessionId,
        name,
        slug: data.slug?.trim() || null,
        sets: clampInt(data.sets ?? 3, 1, 20, 3),
        unit: cleanUnit(data.unit),
      }
    },
  )
  .handler(async ({ data }) => {
    const { db } = await requireSession(data.sessionId)

    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(position), -1) + 1` })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.sessionId, data.sessionId))

    const id = newId()
    await db.insert(workoutSessionExercises).values({
      id,
      sessionId: data.sessionId,
      name: data.name,
      slug: data.slug,
      position: next,
    })
    await db.insert(workoutSets).values(
      Array.from({ length: data.sets }, (_, j) => ({
        id: newId(),
        sessionExerciseId: id,
        position: j,
        unit: data.unit,
      })),
    )
    return { id }
  })

export const removeSessionExercise = createServerFn({ method: 'POST' })
  .validator((sessionExerciseId: string) => sessionExerciseId)
  .handler(async ({ data: sessionExerciseId }) => {
    const { db } = await requireSessionExercise(sessionExerciseId)
    await db
      .delete(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, sessionExerciseId))
  })

// ---------- sets ----------

/** Adds one set, copying the last one's numbers — the usual next-set case. */
export const addSet = createServerFn({ method: 'POST' })
  .validator((sessionExerciseId: string) => sessionExerciseId)
  .handler(async ({ data: sessionExerciseId }) => {
    const { db } = await requireSessionExercise(sessionExerciseId)

    const existing = await db
      .select()
      .from(workoutSets)
      .where(eq(workoutSets.sessionExerciseId, sessionExerciseId))
      .orderBy(desc(workoutSets.position))
      .limit(1)
    const last = existing.at(0)

    const id = newId()
    await db.insert(workoutSets).values({
      id,
      sessionExerciseId,
      position: (last?.position ?? -1) + 1,
      reps: last?.reps ?? null,
      weight: last?.weight ?? null,
      unit: last?.unit ?? 'kg',
    })
    return { id }
  })

export const updateSet = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      setId: string
      reps?: number | null
      weight?: number | null
      unit?: WeightUnit
      done?: boolean
    }) => data,
  )
  .handler(async ({ data }) => {
    const { db, set } = await requireSet(data.setId)
    if (!set) throw new Error('Set not found')

    await db
      .update(workoutSets)
      .set({
        ...(data.reps !== undefined && { reps: cleanNumber(data.reps, 999) }),
        ...(data.weight !== undefined && {
          weight: cleanNumber(data.weight, 10_000),
        }),
        ...(data.unit !== undefined && { unit: cleanUnit(data.unit) }),
        ...(data.done !== undefined && { done: data.done }),
      })
      .where(eq(workoutSets.id, data.setId))
  })

export const deleteSet = createServerFn({ method: 'POST' })
  .validator((setId: string) => setId)
  .handler(async ({ data: setId }) => {
    const { db, set } = await requireSet(setId)
    if (!set) return
    await db.delete(workoutSets).where(eq(workoutSets.id, setId))
  })
