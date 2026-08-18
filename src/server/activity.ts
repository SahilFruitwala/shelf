import { createServerFn } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'

import { getDb } from './db-access'
import { activity, lists, user } from '#/db/schema'
import { requireMembership, requireUser } from './helpers'

/**
 * Recent events on one shelf. Requires a list id — there is no global feed
 * query, so the home screen cannot dump activity across every shared shelf.
 */
export const getRecentActivity = createServerFn({ method: 'GET' })
  .validator((listId: string) => listId)
  .handler(async ({ data: listId }) => {
    const db = await getDb()
    const me = await requireUser()
    await requireMembership(listId, me.id)

    return db
      .select({
        id: activity.id,
        listId: activity.listId,
        action: activity.action,
        itemTitle: activity.itemTitle,
        itemType: activity.itemType,
        createdAt: activity.createdAt,
        actorId: activity.userId,
        actorName: user.name,
        listName: lists.name,
      })
      .from(activity)
      .innerJoin(user, eq(activity.userId, user.id))
      .innerJoin(lists, eq(activity.listId, lists.id))
      .where(eq(activity.listId, listId))
      .orderBy(desc(activity.createdAt))
      .limit(15)
  })
