import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { db } from '#/db'
import {
  ITEM_TYPES,
  LIST_TYPES,
  items,
  listMembers,
  lists,
  user,
} from '#/db/schema'
import type { ListType } from '#/db/schema'
import {
  ensureDefaultShelves,
  newId,
  newJoinCode,
  requireMembership,
  requireUser,
} from './helpers'

export const getMyLists = createServerFn({ method: 'GET' }).handler(
  async () => {
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
        // Qualified names written out: interpolating lists.id renders an
        // unqualified "id" that resolves to the inner table's scope.
        memberCount: sql<number>`(select count(*) from list_members where list_members.list_id = lists.id)`,
        itemCount: sql<number>`(select count(*) from items where items.list_id = lists.id)`,
        toTryCount: sql<number>`(select count(*) from items where items.list_id = lists.id and status = 'to_try')`,
      })
      .from(lists)
      .where(inArray(lists.id, listIds))
      .orderBy(desc(lists.createdAt))

    // Up to four recent item images per list for the cover strip.
    const covers = await db
      .select({
        listId: items.listId,
        imageUrl: items.imageUrl,
      })
      .from(items)
      .where(inArray(items.listId, listIds))
      .orderBy(desc(items.createdAt))

    const coverMap = new Map<string, Array<string>>()
    for (const c of covers) {
      if (!c.imageUrl) continue
      const arr = coverMap.get(c.listId) ?? []
      if (arr.length < 4) {
        arr.push(c.imageUrl)
        coverMap.set(c.listId, arr)
      }
    }

    const result = rows.map((r) => ({
      ...r.list,
      memberCount: r.memberCount,
      itemCount: r.itemCount,
      toTryCount: r.toTryCount,
      coverImages: coverMap.get(r.list.id) ?? [],
      isOwner: r.list.ownerId === me.id,
    }))

    // Built-in shelves first in a stable type order, then custom shelves
    // newest-first (the query already ordered by createdAt desc).
    const typeOrder = new Map(ITEM_TYPES.map((t, i) => [t as string, i]))
    return result.sort((a, b) => {
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
    const me = await requireUser()
    await requireMembership(listId, me.id)

    const list = await db.query.lists.findFirst({
      where: eq(lists.id, listId),
    })
    if (!list) throw new Error('List not found')

    const [listItems, members] = await Promise.all([
      db
        .select()
        .from(items)
        .where(eq(items.listId, listId))
        .orderBy(desc(items.createdAt)),
      db
        .select({
          userId: listMembers.userId,
          role: listMembers.role,
          name: user.name,
        })
        .from(listMembers)
        .innerJoin(user, eq(listMembers.userId, user.id))
        .where(eq(listMembers.listId, listId)),
    ])

    return {
      ...list,
      items: listItems,
      members,
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
    const me = await requireUser()
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
    const me = await requireUser()
    const membership = await requireMembership(listId, me.id)
    if (membership.role !== 'owner')
      throw new Error('Only the owner can manage sharing')

    await db.update(lists).set({ joinCode: null }).where(eq(lists.id, listId))
  })

export const previewJoin = createServerFn({ method: 'GET' })
  .validator((code: string) => code)
  .handler(async ({ data: code }) => {
    const me = await requireUser()
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
    const me = await requireUser()
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
    }
    return { listId: list.id }
  })
