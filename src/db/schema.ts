import {
  sqliteTable,
  integer,
  real,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ---------- Users ----------
// Clerk owns authentication; `id` mirrors the Clerk user id and this table is
// synced from Clerk (see src/lib/auth.server.ts) so the app can join on it.

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  // GDPR soft-delete: when a user deletes their account we mark `deletedAt`
  // and set `purgeAfter` (deletedAt + retention window). The Clerk user is
  // removed immediately so they can't sign in, but local rows are kept until
  // `purgeAfter`, then hard-deleted by scripts/purge-deleted-users.ts.
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  purgeAfter: integer('purge_after', { mode: 'timestamp' }),
})

// ---------- Per-user feature flags ----------
// Managed in the DB (not env). Insert/update a row to roll a feature out to a
// user, e.g. `UPDATE user_feature_flags SET sharing = 1 WHERE user_id = …`.

export const FEATURE_FLAGS = ['sharing'] as const
export type FeatureFlag = (typeof FEATURE_FLAGS)[number]

export const userFeatureFlags = sqliteTable('user_feature_flags', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Shared shelves: invite links, view-only links, join.
  sharing: integer('sharing', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export type UserFeatureFlags = typeof userFeatureFlags.$inferSelect

// ---------- Rate limiting ----------
// Fixed-window counters for the outbound API proxies (TMDb, Places, link
// previews). Lives in the DB rather than in memory because the serverless
// runtime gives no shared process to count in — a per-instance counter would
// let the limit scale with however many instances Vercel happens to spin up.

export const rateLimits = sqliteTable('rate_limits', {
  // `${bucket}:${subject}` — subject is a user id, or an ip for anonymous hits.
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  // Epoch seconds, as a plain integer rather than a `mode: 'timestamp'`
  // column. The limiter does its window arithmetic inside a raw SQL CASE,
  // where drizzle's timestamp mapper doesn't apply — a bound Date lands there
  // in the wrong unit and silently corrupts the window.
  windowStart: integer('window_start').notNull(),
})

// ---------- Shelf tables ----------

export const ITEM_TYPES = [
  'restaurant',
  'movie',
  'tv',
  'book',
  'place',
  'wishlist',
] as const
export type ItemType = (typeof ITEM_TYPES)[number]

export const LIST_TYPES = [...ITEM_TYPES, 'mixed', 'trip'] as const
export type ListType = (typeof LIST_TYPES)[number]

export const ITEM_STATUSES = ['to_try', 'done', 'abandoned'] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

/**
 * Type-specific extras on an item: author, year, cuisine, address, price…
 *
 * Values are `string | undefined` rather than `string` because this is a
 * sparse bag — any given key is usually absent. A plain
 * `Record<string, string>` would tell TypeScript every key always exists,
 * which made correct guards like `metadata?.group?.trim()` read as redundant
 * while being the only thing standing between us and a runtime throw.
 */
export type ItemMetadata = Record<string, string | undefined>

export const lists = sqliteTable(
  'lists',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type', { enum: LIST_TYPES }).notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    joinCode: text('join_code').unique(),
    // Revocable code for the public read-only page (/s/$code).
    viewCode: text('view_code').unique(),
    // One auto-created shelf per user per type; items land here unless the
    // user picks a specific shelf.
    isDefault: integer('is_default', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('lists_owner_idx').on(t.ownerId)],
)

export const listMembers = sqliteTable(
  'list_members',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'editor'] })
      .notNull()
      .default('editor'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('list_members_list_idx').on(t.listId),
    index('list_members_user_idx').on(t.userId),
  ],
)

export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ITEM_TYPES }).notNull(),
    title: text('title').notNull(),
    notes: text('notes'),
    link: text('link'),
    imageUrl: text('image_url'),
    status: text('status', { enum: ITEM_STATUSES }).notNull().default('to_try'),
    // Type-specific extras: author, year, cuisine, address, price...
    //
    // The value type is `string | undefined`, not `string`: this is a sparse
    // bag of optional keys, and a plain `Record<string, string>` would claim
    // every key always exists. That made honest guards like
    // `metadata?.group?.trim()` look redundant to the linter while being the
    // only thing preventing a runtime throw on a missing key.
    metadata: text('metadata', { mode: 'json' }).$type<ItemMetadata>(),
    addedBy: text('added_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('items_list_idx').on(t.listId),
    index('items_list_status_created_idx').on(
      t.listId,
      t.status,
      t.createdAt,
      t.id,
    ),
    index('items_list_status_title_idx').on(
      t.listId,
      t.status,
      sql`lower(title)`,
      t.id,
    ),
    // `->>` not json_extract(): drizzle-kit splits index expressions on
    // commas, so the two-arg form is parsed as two bogus columns.
    index('items_list_genre_idx').on(t.listId, sql`metadata ->> '$.genre'`),
  ],
)

export const ACTIVITY_ACTIONS = [
  'added',
  'completed',
  'abandoned',
  'reverted',
  'removed',
  'joined',
] as const
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number]

export const activity = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    action: text('action', { enum: ACTIVITY_ACTIONS }).notNull(),
    // Denormalized so events still render after the item is deleted.
    itemTitle: text('item_title'),
    itemType: text('item_type', { enum: ITEM_TYPES }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('activity_list_idx').on(t.listId)],
)

/** One 👍 per user per item — a lightweight "nice pick" on shared shelves. */
export const itemReactions = sqliteTable(
  'item_reactions',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('item_reactions_item_idx').on(t.itemId),
    uniqueIndex('item_reactions_item_user_idx').on(t.itemId, t.userId),
  ],
)

/** Episodes ticked off on a `tv` item. Scoped to the item (not the user) to
 *  match `items.status`, so a shared shelf tracks one agreed progress. */
export const watchedEpisodes = sqliteTable(
  'watched_episodes',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    season: integer('season').notNull(),
    number: integer('number').notNull(),
    // From the Trakt import where known; otherwise when it was ticked here.
    watchedAt: integer('watched_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('watched_episodes_item_idx').on(t.itemId),
    uniqueIndex('watched_episodes_item_ep_idx').on(
      t.itemId,
      t.season,
      t.number,
    ),
  ],
)

export type WatchedEpisode = typeof watchedEpisodes.$inferSelect

// ---------- Workouts ----------
// Deliberately outside the lists/items model: a workout is a dated session of
// exercises, each with its own sets — not one row with a to_try/done status.

export const WEIGHT_UNITS = ['kg', 'lb'] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

/** A saved routine — "Push day", "Leg day" — so exercises aren't retyped. */
export const workoutTemplates = sqliteTable(
  'workout_templates',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('workout_templates_user_idx').on(t.userId)],
)

export const workoutTemplateExercises = sqliteTable(
  'workout_template_exercises',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** free-exercise-db id, when picked from the exercise search. */
    slug: text('slug'),
    position: integer('position').notNull().default(0),
    targetSets: integer('target_sets').notNull().default(3),
    targetReps: integer('target_reps'),
    targetWeight: real('target_weight'),
    unit: text('unit', { enum: WEIGHT_UNITS }).notNull().default('kg'),
  },
  (t) => [index('workout_template_exercises_template_idx').on(t.templateId)],
)

/** One day at the gym. `templateId` is kept only as a provenance hint — the
 *  exercises are copied in, so editing a template never rewrites history. */
export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Local calendar day as YYYY-MM-DD — a timestamp would drift by timezone. */
    date: text('date').notNull(),
    name: text('name').notNull(),
    templateId: text('template_id').references(() => workoutTemplates.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('workout_sessions_user_date_idx').on(t.userId, t.date)],
)

export const workoutSessionExercises = sqliteTable(
  'workout_session_exercises',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug'),
    position: integer('position').notNull().default(0),
    notes: text('notes'),
  },
  (t) => [
    index('workout_session_exercises_session_idx').on(t.sessionId),
    // "What did I lift last time?" looks an exercise up by name across every
    // past session, so that lookup needs its own index.
    index('workout_session_exercises_name_idx').on(t.name),
  ],
)

export const workoutSets = sqliteTable(
  'workout_sets',
  {
    id: text('id').primaryKey(),
    sessionExerciseId: text('session_exercise_id')
      .notNull()
      .references(() => workoutSessionExercises.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    reps: integer('reps'),
    weight: real('weight'),
    unit: text('unit', { enum: WEIGHT_UNITS }).notNull().default('kg'),
    /** Ticked off during the session; untouched prefilled sets stay false. */
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('workout_sets_exercise_idx').on(t.sessionExerciseId)],
)

export type WorkoutTemplate = typeof workoutTemplates.$inferSelect
export type WorkoutTemplateExercise =
  typeof workoutTemplateExercises.$inferSelect
export type WorkoutSession = typeof workoutSessions.$inferSelect
export type WorkoutSessionExercise = typeof workoutSessionExercises.$inferSelect
export type WorkoutSet = typeof workoutSets.$inferSelect

export type List = typeof lists.$inferSelect
export type ListMember = typeof listMembers.$inferSelect
export type Item = typeof items.$inferSelect
export type Activity = typeof activity.$inferSelect
export type ItemReaction = typeof itemReactions.$inferSelect
