import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'

import { itemReactions, items, listMembers } from '#/db/schema'
import { getDb } from './db-access'
import { newId, requireUser } from './helpers'

export const toggleReaction = createServerFn({ method: 'POST' })
  .validator((itemId: string) => itemId)
  .handler(async ({ data: itemId }) => {
    const db = await getDb()
    const me = await requireUser()

    // Item lookup and membership check as one join — same shape as the
    // episode guard. A row that isn't on a shelf you belong to simply doesn't
    // match, so "missing" and "not yours" stay indistinguishable.
    const allowed = await db
      .select({ id: items.id })
      .from(items)
      .innerJoin(
        listMembers,
        and(
          eq(listMembers.listId, items.listId),
          eq(listMembers.userId, me.id),
        ),
      )
      .where(eq(items.id, itemId))
      .limit(1)
    if (allowed.length === 0) throw new Error('Item not found')

    // Delete-returning collapses the read-then-write into one hop.
    const removed = await db
      .delete(itemReactions)
      .where(
        and(
          eq(itemReactions.itemId, itemId),
          eq(itemReactions.userId, me.id),
        ),
      )
      .returning({ id: itemReactions.id })
    if (removed.length > 0) return { reacted: false }

    await db
      .insert(itemReactions)
      .values({ id: newId(), itemId, userId: me.id })
      // Guards the (item, user) unique index against a double-tap.
      .onConflictDoNothing()
    return { reacted: true }
  })
