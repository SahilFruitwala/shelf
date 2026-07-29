import { and, eq } from 'drizzle-orm'

import {
  ITEM_TYPES,
  activity,
  listMembers,
  lists,
  userFeatureFlags,
} from '#/db/schema'
import type { ActivityAction, ItemType } from '#/db/schema'
import { getAuthUser, getDb } from './db-access'

export async function requireUser() {
  const user = await getAuthUser()
  if (!user) {
    throw new Error('Not signed in')
  }
  return user
}

/**
 * Authorizes an anonymous caller holding a public view code. Mirrors the gate
 * in `getPublicList`: the code must resolve to a shelf whose owner still has
 * the sharing feature, so revoking either kills access.
 *
 * Joins to the flag row rather than calling `userHasFeature` — one round trip
 * instead of two, and it keeps helpers free of a cycle back through features.
 */
export async function assertLiveViewCode(code: string) {
  const db = await getDb()
  const rows = await db
    .select({ sharing: userFeatureFlags.sharing })
    .from(lists)
    .innerJoin(userFeatureFlags, eq(userFeatureFlags.userId, lists.ownerId))
    .where(eq(lists.viewCode, code))
    .limit(1)
  if (!rows.at(0)?.sharing) throw new Error('This link is no longer valid')
}

export async function requireMembership(listId: string, userId: string) {
  const db = await getDb()
  const membership = await db.query.listMembers.findFirst({
    where: and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)),
  })
  if (!membership) {
    throw new Error('You are not a member of this list')
  }
  return membership
}

const DEFAULT_LIST_NAMES: Record<ItemType, string> = {
  restaurant: 'Restaurants',
  movie: 'Movies',
  tv: 'TV series',
  book: 'Books',
  place: 'Places',
  wishlist: 'Wishlist',
}

/** The user's default shelf for a type, created on first use. */
export async function getOrCreateDefaultList(userId: string, type: ItemType) {
  const db = await getDb()
  const existing = await db.query.lists.findFirst({
    where: and(
      eq(lists.ownerId, userId),
      eq(lists.type, type),
      eq(lists.isDefault, true),
    ),
  })
  if (existing) return existing.id

  const listId = newId()
  await db.insert(lists).values({
    id: listId,
    name: DEFAULT_LIST_NAMES[type],
    type,
    ownerId: userId,
    isDefault: true,
  })
  await db.insert(listMembers).values({
    id: newId(),
    listId,
    userId,
    role: 'owner',
  })
  return listId
}

export function newId() {
  return crypto.randomUUID()
}

/** Every user gets one built-in shelf per type; items land there unless a
 *  specific shelf is chosen. Creates any that are missing.
 *
 *  This runs on every home-page load, so it's written for the steady state
 *  where all six already exist: one read, and no writes at all. Doing it per
 *  type meant six sequential round trips (~55ms each) to discover there was
 *  nothing to do. */
export async function ensureDefaultShelves(userId: string) {
  const db = await getDb()
  const existing = await db
    .select({ type: lists.type })
    .from(lists)
    .where(and(eq(lists.ownerId, userId), eq(lists.isDefault, true)))

  const have = new Set(existing.map((r) => r.type))
  const missing = ITEM_TYPES.filter((t) => !have.has(t))
  if (missing.length === 0) return

  const newLists = missing.map((type) => ({
    id: newId(),
    name: DEFAULT_LIST_NAMES[type],
    type,
    ownerId: userId,
    isDefault: true,
  }))
  await db.insert(lists).values(newLists)
  await db.insert(listMembers).values(
    newLists.map((l) => ({
      id: newId(),
      listId: l.id,
      userId,
      role: 'owner' as const,
    })),
  )
}

export async function logActivity(
  listId: string,
  userId: string,
  action: ActivityAction,
  item?: { title: string; type: ItemType },
) {
  const db = await getDb()
  await db.insert(activity).values({
    id: newId(),
    listId,
    userId,
    action,
    itemTitle: item?.title,
    itemType: item?.type,
  })
}

// Short, unambiguous join code (no 0/O/1/l/I).
export function newJoinCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let code = ''
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  for (const b of bytes) code += alphabet[b % alphabet.length]
  return code
}
