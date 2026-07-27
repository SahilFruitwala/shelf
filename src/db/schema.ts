import {
  sqliteTable,
  integer,
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
    metadata: text('metadata', { mode: 'json' }).$type<
      Record<string, string>
    >(),
    addedBy: text('added_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (t) => [index('items_list_idx').on(t.listId)],
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

export type List = typeof lists.$inferSelect
export type ListMember = typeof listMembers.$inferSelect
export type Item = typeof items.$inferSelect
export type Activity = typeof activity.$inferSelect
export type ItemReaction = typeof itemReactions.$inferSelect
