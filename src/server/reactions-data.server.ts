import '@tanstack/react-start/server-only'

import { eq } from 'drizzle-orm'

import { itemReactions, items, user } from '#/db/schema'
import { getDb } from './db-access'

/** Reactions keyed by item id, for a shelf the caller is a member of. */
export async function getReactionsForList(listId: string) {
  const db = await getDb()
  const rows = await db
    .select({
      itemId: itemReactions.itemId,
      userId: itemReactions.userId,
      name: user.name,
    })
    .from(itemReactions)
    .innerJoin(items, eq(itemReactions.itemId, items.id))
    .innerJoin(user, eq(itemReactions.userId, user.id))
    .where(eq(items.listId, listId))

  const map = new Map<string, Array<{ userId: string; name: string }>>()
  for (const r of rows) {
    const arr = map.get(r.itemId) ?? []
    arr.push({ userId: r.userId, name: r.name })
    map.set(r.itemId, arr)
  }
  return map
}
