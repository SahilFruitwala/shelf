import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'

import { getDb } from './db-access'
import { activity, listMembers, lists, user } from '#/db/schema'
import { requireUser } from './helpers'

/**
 * Recent events on the user's shared shelves (more than one member) — a feed
 * only makes sense where someone else can see it.
 */
export const getRecentActivity = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDb()
    const me = await requireUser()

    const memberships = await db
      .select({ listId: listMembers.listId })
      .from(listMembers)
      .where(eq(listMembers.userId, me.id))
    const listIds = memberships.map((m) => m.listId)
    if (listIds.length === 0) return []

    const shared = await db
      .select({ id: lists.id })
      .from(lists)
      .where(
        and(
          inArray(lists.id, listIds),
          gt(
            // Qualified names written out: interpolating lists.id renders an
            // unqualified "id" that resolves to the inner table's scope.
            sql<number>`(select count(*) from list_members where list_members.list_id = lists.id)`,
            1,
          ),
        ),
      )
    const sharedIds = shared.map((s) => s.id)
    if (sharedIds.length === 0) return []

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
      .where(inArray(activity.listId, sharedIds))
      .orderBy(desc(activity.createdAt))
      .limit(15)
  },
)
