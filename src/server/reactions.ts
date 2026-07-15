import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'

import { itemReactions, items } from '#/db/schema'
import { getDb } from './db-access'
import { newId, requireMembership, requireUser } from './helpers'

export const toggleReaction = createServerFn({ method: 'POST' })
  .validator((itemId: string) => itemId)
  .handler(async ({ data: itemId }) => {
    const db = await getDb()
    const me = await requireUser()
    const item = await db.query.items.findFirst({
      where: eq(items.id, itemId),
    })
    if (!item) throw new Error('Item not found')
    await requireMembership(item.listId, me.id)

    const existing = await db.query.itemReactions.findFirst({
      where: and(
        eq(itemReactions.itemId, itemId),
        eq(itemReactions.userId, me.id),
      ),
    })

    if (existing) {
      await db.delete(itemReactions).where(eq(itemReactions.id, existing.id))
      return { reacted: false }
    }

    await db.insert(itemReactions).values({
      id: newId(),
      itemId,
      userId: me.id,
    })
    return { reacted: true }
  })
