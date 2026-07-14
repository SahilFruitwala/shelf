import { getRequest } from '@tanstack/react-start/server'
import { and, eq } from 'drizzle-orm'

import { auth } from '#/lib/auth'
import { db } from '#/db'
import { ITEM_TYPES, listMembers, lists } from '#/db/schema'
import type { ItemType } from '#/db/schema'

export async function requireUser() {
  const { headers } = getRequest()
  const session = await auth.api.getSession({ headers })
  if (!session?.user) {
    throw new Error('Not signed in')
  }
  return session.user
}

export async function requireMembership(listId: string, userId: string) {
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
 *  specific shelf is chosen. Creates any that are missing. */
export async function ensureDefaultShelves(userId: string) {
  for (const type of ITEM_TYPES) {
    await getOrCreateDefaultList(userId, type)
  }
}

// Short, unambiguous join code (no 0/O/1/l/I).
export function newJoinCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let code = ''
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  for (const b of bytes) code += alphabet[b % alphabet.length]
  return code
}
