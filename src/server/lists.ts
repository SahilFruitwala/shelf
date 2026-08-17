import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import {
  ITEM_TYPES,
  LIST_TYPES,
  items,
  listMembers,
  lists,
  user,
} from '#/db/schema'
import type { ListType } from '#/db/schema'
import { getDb } from './db-access'
import {
  requireFeature,
  requireUserWithFeature,
  userHasFeature,
} from './features'
import {
  ensureDefaultShelves,
  logActivity,
  newId,
  newJoinCode,
  requireMembership,
  requireUser,
} from './helpers'

export const getMyLists = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDb()
    const me = await requireUser()
    await ensureDefaultShelves(me.id)

    const memberships = await db
      .select({ listId: listMembers.listId })
      .from(listMembers)
      .where(eq(listMembers.userId, me.id))
    const listIds = memberships.map((m) => m.listId)
    if (listIds.length === 0) return []

    const rows = await db
      .select({
        list: lists,
        memberCount: sql<number>`(select count(*) from list_members where list_members.list_id = lists.id)`,
      })
      .from(lists)
      .where(inArray(lists.id, listIds))
      .orderBy(desc(lists.createdAt))

    // Compute both item totals in one indexed pass. Two correlated count
    // subqueries used to walk every shelf twice.
    const itemCounts = await db
      .select({
        listId: items.listId,
        itemCount: sql<number>`count(*)`,
        toTryCount: sql<number>`sum(case when ${items.status} = 'to_try' then 1 else 0 end)`,
      })
      .from(items)
      .where(inArray(items.listId, listIds))
      .groupBy(items.listId)
    const countsByList = new Map(itemCounts.map((r) => [r.listId, r]))

    // Up to four recent item images per list for the cover strip. The ranking
    // happens in SQL so this returns at most 4 rows per shelf — selecting every
    // item the user owns just to keep the first few of each meant shipping
    // thousands of rows over the wire to render a couple dozen thumbnails.
    const covers = await db.all<{ list_id: string; image_url: string }>(sql`
      select list_id, image_url from (
        select
          list_id,
          image_url,
          row_number() over (
            partition by list_id order by created_at desc, id desc
          ) as rn
        from items
        where list_id in (${sql.join(
          listIds.map((id) => sql`${id}`),
          sql`, `,
        )}) and image_url is not null
      )
      where rn <= 4
    `)

    const coverMap = new Map<string, Array<string>>()
    for (const c of covers) {
      const arr = coverMap.get(c.list_id) ?? []
      arr.push(c.image_url)
      coverMap.set(c.list_id, arr)
    }

    const result = rows.map((r) => ({
      ...r.list,
      memberCount: r.memberCount,
      itemCount: countsByList.get(r.list.id)?.itemCount ?? 0,
      toTryCount: countsByList.get(r.list.id)?.toTryCount ?? 0,
      coverImages: coverMap.get(r.list.id) ?? [],
      isOwner: r.list.ownerId === me.id,
    }))

    // Built-in shelves first in a stable type order, then custom shelves
    // newest-first (the query already ordered by createdAt desc).
    // Drop rows whose type is no longer in the app (e.g. a retired category).
    const knownTypes = new Set<string>(LIST_TYPES)
    const typeOrder = new Map(ITEM_TYPES.map((t, i) => [t as string, i]))
    return result
      .filter((r) => knownTypes.has(r.type))
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
        if (a.isDefault && b.isDefault)
          return (typeOrder.get(a.type) ?? 99) - (typeOrder.get(b.type) ?? 99)
        return 0
      })
  },
)

export const getList = createServerFn({ method: 'GET' })
  .validator((listId: string) => listId)
  .handler(async ({ data: listId }) => {
    const db = await getDb()
    const { getReactionsForList } = await import('./reactions-data.server')
    const me = await requireUser()
    await requireMembership(listId, me.id)

    const list = await db.query.lists.findFirst({
      where: eq(lists.id, listId),
    })
    if (!list) throw new Error('List not found')

    // Items themselves come from the paginated getListItems — a shelf can hold
    // thousands, so only the aggregates the toolbar needs are computed here.
    const [summaryRows, members, reactions] = await Promise.all([
      db
        .select({
          status: items.status,
          genre: sql<string | null>`items.metadata ->> '$.genre'`,
          count: sql<number>`count(*)`,
        })
        .from(items)
        .where(eq(items.listId, listId))
        .groupBy(items.status, sql`items.metadata ->> '$.genre'`),
      db
        .select({
          userId: listMembers.userId,
          role: listMembers.role,
          name: user.name,
        })
        .from(listMembers)
        .innerJoin(user, eq(listMembers.userId, user.id))
        .where(eq(listMembers.listId, listId)),
      getReactionsForList(listId),
    ])

    const counts = { all: 0, to_try: 0, done: 0, abandoned: 0 }
    for (const r of summaryRows) {
      counts[r.status] += r.count
      counts.all += r.count
    }

    // Rows are whole "Action, Comedy" strings — split them into a flat set.
    const genreOptions = [
      ...new Set(
        summaryRows.flatMap((r) =>
          (r.genre ?? '')
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean),
        ),
      ),
    ].sort((a, b) => a.localeCompare(b))

    return {
      ...list,
      counts,
      genreOptions,
      members,
      reactionsByItem: Object.fromEntries(reactions),
      isOwner: list.ownerId === me.id,
      myUserId: me.id,
    }
  })

export const createList = createServerFn({ method: 'POST' })
  .validator((data: { name: string; type: ListType }) => {
    const name = data.name.trim()
    if (!name) throw new Error('List name is required')
    if (name.length > 80) throw new Error('List name is too long')
    if (!LIST_TYPES.includes(data.type)) throw new Error('Unknown list type')
    return { name, type: data.type }
  })
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()
    const listId = newId()

    await db.insert(lists).values({
      id: listId,
      name: data.name,
      type: data.type,
      ownerId: me.id,
    })
    await db.insert(listMembers).values({
      id: newId(),
      listId,
      userId: me.id,
      role: 'owner',
    })

    return { id: listId }
  })

export const renameList = createServerFn({ method: 'POST' })
  .validator((data: { listId: string; name: string }) => {
    const name = data.name.trim()
    if (!name) throw new Error('List name is required')
    return { listId: data.listId, name }
  })
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()
    const membership = await requireMembership(data.listId, me.id)
    if (membership.role !== 'owner')
      throw new Error('Only the owner can rename a list')
    const list = await db.query.lists.findFirst({
      where: eq(lists.id, data.listId),
    })
    if (list?.isDefault) throw new Error('Built-in shelves cannot be renamed')

    await db
      .update(lists)
      .set({ name: data.name })
      .where(eq(lists.id, data.listId))
  })

export const deleteList = createServerFn({ method: 'POST' })
  .validator((listId: string) => listId)
  .handler(async ({ data: listId }) => {
    const db = await getDb()
    const me = await requireUser()
    const membership = await requireMembership(listId, me.id)
    if (membership.role !== 'owner')
      throw new Error('Only the owner can delete a list')
    const list = await db.query.lists.findFirst({ where: eq(lists.id, listId) })
    if (list?.isDefault) throw new Error('Built-in shelves cannot be deleted')

    await db.delete(lists).where(eq(lists.id, listId))
  })

export const leaveList = createServerFn({ method: 'POST' })
  .validator((listId: string) => listId)
  .handler(async ({ data: listId }) => {
    const db = await getDb()
    const me = await requireUser()
    const membership = await requireMembership(listId, me.id)
    if (membership.role === 'owner')
      throw new Error(
        'The owner cannot leave their own list — delete it instead',
      )

    await db.delete(listMembers).where(eq(listMembers.id, membership.id))
  })

export const removeMember = createServerFn({ method: 'POST' })
  .validator((data: { listId: string; userId: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()
    const membership = await requireMembership(data.listId, me.id)
    if (membership.role !== 'owner')
      throw new Error('Only the owner can remove members')
    if (data.userId === me.id)
      throw new Error('Use delete to remove your own list')

    await db
      .delete(listMembers)
      .where(
        and(
          eq(listMembers.listId, data.listId),
          eq(listMembers.userId, data.userId),
        ),
      )
  })

// ---------- sharing ----------

export const enableSharing = createServerFn({ method: 'POST' })
  .validator((listId: string) => listId)
  .handler(async ({ data: listId }) => {
    const db = await getDb()
    const me = await requireUserWithFeature('sharing')
    const membership = await requireMembership(listId, me.id)
    if (membership.role !== 'owner')
      throw new Error('Only the owner can share a list')

    const joinCode = newJoinCode()
    await db.update(lists).set({ joinCode }).where(eq(lists.id, listId))
    return { joinCode }
  })

export const disableSharing = createServerFn({ method: 'POST' })
  .validator((listId: string) => listId)
  .handler(async ({ data: listId }) => {
    const db = await getDb()
    const me = await requireUserWithFeature('sharing')
    const membership = await requireMembership(listId, me.id)
    if (membership.role !== 'owner')
      throw new Error('Only the owner can manage sharing')

    await db.update(lists).set({ joinCode: null }).where(eq(lists.id, listId))
  })

export const enableViewLink = createServerFn({ method: 'POST' })
  .validator((listId: string) => listId)
  .handler(async ({ data: listId }) => {
    const db = await getDb()
    const me = await requireUserWithFeature('sharing')
    const membership = await requireMembership(listId, me.id)
    if (membership.role !== 'owner')
      throw new Error('Only the owner can share a list')

    const viewCode = newJoinCode()
    await db.update(lists).set({ viewCode }).where(eq(lists.id, listId))
    return { viewCode }
  })

export const disableViewLink = createServerFn({ method: 'POST' })
  .validator((listId: string) => listId)
  .handler(async ({ data: listId }) => {
    const db = await getDb()
    const me = await requireUserWithFeature('sharing')
    const membership = await requireMembership(listId, me.id)
    if (membership.role !== 'owner')
      throw new Error('Only the owner can manage sharing')

    await db.update(lists).set({ viewCode: null }).where(eq(lists.id, listId))
  })

/** Public: the read-only view of a shelf, by view code. No auth.
 *  Only served when the shelf owner still has the sharing feature. */
export const getPublicList = createServerFn({ method: 'GET' })
  .validator((code: string) => code)
  .handler(async ({ data: code }) => {
    const db = await getDb()
    const list = await db.query.lists.findFirst({
      where: eq(lists.viewCode, code),
    })
    if (!list) return null
    if (!(await userHasFeature(list.ownerId, 'sharing'))) return null

    const [owner, listItems] = await Promise.all([
      db.query.user.findFirst({
        where: eq(user.id, list.ownerId),
        columns: { name: true },
      }),
      db
        .select({
          id: items.id,
          type: items.type,
          title: items.title,
          notes: items.notes,
          link: items.link,
          imageUrl: items.imageUrl,
          status: items.status,
          metadata: items.metadata,
        })
        .from(items)
        .where(eq(items.listId, list.id))
        .orderBy(desc(items.createdAt)),
    ])

    return {
      name: list.name,
      type: list.type,
      ownerName: owner?.name ?? 'Someone',
      items: listItems,
    }
  })

export const previewJoin = createServerFn({ method: 'GET' })
  .validator((code: string) => code)
  .handler(async ({ data: code }) => {
    const db = await getDb()
    const me = await requireUser()
    await requireFeature(me.id, 'sharing')
    const list = await db.query.lists.findFirst({
      where: eq(lists.joinCode, code),
    })
    if (!list) return { found: false as const }

    const owner = await db.query.user.findFirst({
      where: eq(user.id, list.ownerId),
      columns: { name: true },
    })
    const existing = await db.query.listMembers.findFirst({
      where: and(
        eq(listMembers.listId, list.id),
        eq(listMembers.userId, me.id),
      ),
    })

    return {
      found: true as const,
      listId: list.id,
      name: list.name,
      type: list.type,
      ownerName: owner?.name ?? 'Someone',
      alreadyMember: Boolean(existing),
    }
  })

export const joinList = createServerFn({ method: 'POST' })
  .validator((code: string) => code)
  .handler(async ({ data: code }) => {
    const db = await getDb()
    const me = await requireUserWithFeature('sharing')
    const list = await db.query.lists.findFirst({
      where: eq(lists.joinCode, code),
    })
    if (!list) throw new Error('This invite link is no longer valid')

    const existing = await db.query.listMembers.findFirst({
      where: and(
        eq(listMembers.listId, list.id),
        eq(listMembers.userId, me.id),
      ),
    })
    if (!existing) {
      await db.insert(listMembers).values({
        id: newId(),
        listId: list.id,
        userId: me.id,
        role: 'editor',
      })
      await logActivity(list.id, me.id, 'joined')
    }
    return { listId: list.id }
  })
