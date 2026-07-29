import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'

import { getDb } from './db-access'
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  items,
  listMembers,
  lists,
} from '#/db/schema'
import type { ItemStatus, ItemType } from '#/db/schema'
import { normalizeTitle, safeHttpUrl } from '#/lib/utils'
import {
  getOrCreateDefaultList,
  logActivity,
  newId,
  requireMembership,
  requireUser,
} from './helpers'

interface ItemInput {
  /** Omitted → the item lands on the user's default shelf for its type. */
  listId?: string
  type: ItemType
  title: string
  notes?: string
  link?: string
  imageUrl?: string
  metadata?: Record<string, string>
}

function cleanItemInput(data: ItemInput) {
  const title = data.title.trim()
  if (!title) throw new Error('Title is required')
  if (!ITEM_TYPES.includes(data.type)) throw new Error('Unknown item type')
  return {
    ...data,
    title,
    notes: data.notes?.trim() || undefined,
    link: safeHttpUrl(data.link),
    imageUrl: safeHttpUrl(data.imageUrl),
  }
}

export const addItem = createServerFn({ method: 'POST' })
  .validator(cleanItemInput)
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()

    let listId: string
    if (data.listId) {
      await requireMembership(data.listId, me.id)
      listId = data.listId
    } else {
      listId = await getOrCreateDefaultList(me.id, data.type)
    }

    const id = newId()
    await db.insert(items).values({
      id,
      listId,
      type: data.type,
      title: data.title,
      notes: data.notes,
      link: data.link,
      imageUrl: data.imageUrl,
      metadata: data.metadata,
      addedBy: me.id,
    })
    await logActivity(listId, me.id, 'added', {
      title: data.title,
      type: data.type,
    })
    return { id, listId }
  })

/** Title matches already on this shelf — for duplicate warnings at add-time. */
export const findDuplicatesOnShelf = createServerFn({ method: 'GET' })
  .validator((data: { listId?: string; type: ItemType; title: string }) => ({
    listId: data.listId,
    type: data.type,
    title: data.title.trim(),
  }))
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()
    if (!data.title) return []

    const listId = data.listId
      ? (await requireMembership(data.listId, me.id), data.listId)
      : await getOrCreateDefaultList(me.id, data.type)

    const normalized = normalizeTitle(data.title)
    const shelfItems = await db
      .select({
        id: items.id,
        title: items.title,
        status: items.status,
      })
      .from(items)
      .where(eq(items.listId, listId))

    return shelfItems.filter((i) => normalizeTitle(i.title) === normalized)
  })

export const ITEM_SORTS = ['recent', 'alpha', 'completed'] as const
export type ItemSort = (typeof ITEM_SORTS)[number]

const PAGE_SIZE = 24
const MAX_PAGE_SIZE = 500

/** `%` and `_` are LIKE wildcards — escape them so genres match literally. */
function likeLiteral(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** One page of a shelf's items, filtered and sorted in SQL.
 *  Offset-based so the UI can offer numbered pages and jump around. */
export const getListItems = createServerFn({ method: 'GET' })
  .validator(
    (data: {
      listId: string
      status?: ItemStatus | 'all'
      genres?: Array<string>
      /** Free-text filter over this shelf's own items. */
      q?: string
      sort?: ItemSort
      page?: number
      perPage?: number
    }) => {
      if (
        data.status &&
        data.status !== 'all' &&
        !ITEM_STATUSES.includes(data.status)
      )
        throw new Error('Unknown status')
      if (data.sort && !ITEM_SORTS.includes(data.sort))
        throw new Error('Unknown sort')
      return { ...data, q: data.q?.trim() }
    },
  )
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()
    await requireMembership(data.listId, me.id)

    const sort = data.sort ?? 'recent'
    const perPage = Math.min(
      Math.max(Math.trunc(data.perPage ?? PAGE_SIZE), 1),
      MAX_PAGE_SIZE,
    )

    const where = [eq(items.listId, data.listId)]
    if (data.status && data.status !== 'all')
      where.push(eq(items.status, data.status))

    // "Action, Comedy" is stored as one string — wrap both sides in the
    // separator so "Action" can't match inside "Action & Adventure".
    if (data.genres?.length) {
      const genreMatches = data.genres.map(
        (g) =>
          sql`', ' || coalesce(items.metadata ->> '$.genre', '') || ', ' like ${`%, ${likeLiteral(g)}, %`} escape '\\'`,
      )
      where.push(or(...genreMatches)!)
    }

    // Same fields the global search covers, plus the two metadata fields that
    // read as part of the title on a card (a book's author, a place's address).
    if (data.q && data.q.length >= 2) {
      const pattern = `%${likeLiteral(data.q)}%`
      where.push(
        or(
          sql`items.title like ${pattern} escape '\\'`,
          sql`items.notes like ${pattern} escape '\\'`,
          sql`items.metadata ->> '$.author' like ${pattern} escape '\\'`,
          sql`items.metadata ->> '$.address' like ${pattern} escape '\\'`,
        )!,
      )
    }

    const filter = and(...where)

    // The id tiebreaker keeps rows with equal sort keys from drifting between
    // pages, which OFFSET would otherwise let happen.
    const orderBy =
      sort === 'alpha'
        ? [sql`lower(items.title) asc`, sql`items.id asc`]
        : sort === 'completed'
          ? [
              sql`items.completed_at is null asc`,
              sql`items.completed_at desc`,
              sql`items.id desc`,
            ]
          : [sql`items.created_at desc`, sql`items.id desc`]

    const pageQuery = (n: number) =>
      db
        .select()
        .from(items)
        .where(filter)
        .orderBy(...orderBy)
        .limit(perPage)
        .offset((n - 1) * perPage)

    // The count and the rows are independent, so they go out together rather
    // than one after the other — at ~55ms a hop that's half the latency of
    // every filter, sort and page change. The rows are fetched for the page
    // that was *asked* for, which is only wrong when a stale page number needs
    // clamping (filter narrowed, items deleted); page 1 can never be clamped,
    // and that's the overwhelming majority of requests.
    const requestedPage = Math.max(Math.trunc(data.page ?? 1), 1)
    const [countRows, requestedRows] = await Promise.all([
      db.select({ total: sql<number>`count(*)` }).from(items).where(filter),
      pageQuery(requestedPage),
    ])

    const total = countRows[0].total
    const totalPages = Math.max(Math.ceil(total / perPage), 1)
    // Clamp so a stale page number still returns rows instead of an empty page.
    const page = Math.min(requestedPage, totalPages)
    const rows = page === requestedPage ? requestedRows : await pageQuery(page)

    return { items: rows, total, page, perPage, totalPages }
  })

export const updateItem = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      itemId: string
      title?: string
      notes?: string
      link?: string
      imageUrl?: string
      metadata?: Record<string, string>
    }) => data,
  )
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()
    const item = await db.query.items.findFirst({
      where: eq(items.id, data.itemId),
    })
    if (!item) throw new Error('Item not found')
    await requireMembership(item.listId, me.id)

    const title = data.title?.trim()
    if (data.title !== undefined && !title) throw new Error('Title is required')

    await db
      .update(items)
      .set({
        ...(title !== undefined && { title }),
        ...(data.notes !== undefined && { notes: data.notes.trim() || null }),
        ...(data.link !== undefined && {
          link: safeHttpUrl(data.link) ?? null,
        }),
        ...(data.imageUrl !== undefined && {
          imageUrl: safeHttpUrl(data.imageUrl) ?? null,
        }),
        ...(data.metadata !== undefined && { metadata: data.metadata }),
      })
      .where(eq(items.id, data.itemId))
  })

export const moveItem = createServerFn({ method: 'POST' })
  .validator((data: { itemId: string; targetListId: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()
    const item = await db.query.items.findFirst({
      where: eq(items.id, data.itemId),
    })
    if (!item) throw new Error('Item not found')
    if (item.listId === data.targetListId) return

    await requireMembership(item.listId, me.id)
    await requireMembership(data.targetListId, me.id)

    const target = await db.query.lists.findFirst({
      where: eq(lists.id, data.targetListId),
    })
    if (!target) throw new Error('Shelf not found')
    if (
      target.type !== 'mixed' &&
      target.type !== 'trip' &&
      target.type !== item.type
    )
      throw new Error(`This shelf only holds ${target.type}s`)

    await db
      .update(items)
      .set({ listId: data.targetListId })
      .where(eq(items.id, data.itemId))
  })

export const bulkSetItemStatus = createServerFn({ method: 'POST' })
  .validator((data: { itemIds: Array<string>; status: ItemStatus }) => {
    if (!ITEM_STATUSES.includes(data.status)) throw new Error('Unknown status')
    if (data.itemIds.length === 0) throw new Error('No items selected')
    return data
  })
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()
    const rows = await db
      .select()
      .from(items)
      .where(inArray(items.id, data.itemIds))
    if (rows.length === 0) return

    const listIds = new Set(rows.map((r) => r.listId))
    if (listIds.size !== 1) throw new Error('Items must be on the same shelf')
    await requireMembership(rows[0].listId, me.id)

    await db
      .update(items)
      .set({
        status: data.status,
        completedAt: data.status === 'done' ? new Date() : null,
      })
      .where(inArray(items.id, data.itemIds))
  })

export const bulkMoveItems = createServerFn({ method: 'POST' })
  .validator((data: { itemIds: Array<string>; targetListId: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()
    if (data.itemIds.length === 0) throw new Error('No items selected')

    const rows = await db
      .select()
      .from(items)
      .where(inArray(items.id, data.itemIds))
    if (rows.length === 0) return

    const sourceListId = rows[0].listId
    if (!rows.every((r) => r.listId === sourceListId))
      throw new Error('Items must be on the same shelf')
    await requireMembership(sourceListId, me.id)
    await requireMembership(data.targetListId, me.id)

    const target = await db.query.lists.findFirst({
      where: eq(lists.id, data.targetListId),
    })
    if (!target) throw new Error('Shelf not found')

    for (const item of rows) {
      if (
        target.type !== 'mixed' &&
        target.type !== 'trip' &&
        target.type !== item.type
      )
        throw new Error(`"${item.title}" doesn't fit on a ${target.type} shelf`)
    }

    await db
      .update(items)
      .set({ listId: data.targetListId })
      .where(inArray(items.id, data.itemIds))
  })

export const bulkDeleteItems = createServerFn({ method: 'POST' })
  .validator((itemIds: Array<string>) => itemIds)
  .handler(async ({ data: itemIds }) => {
    const db = await getDb()
    const me = await requireUser()
    if (itemIds.length === 0) return

    const rows = await db.select().from(items).where(inArray(items.id, itemIds))
    if (rows.length === 0) return

    const listIds = new Set(rows.map((r) => r.listId))
    if (listIds.size !== 1) throw new Error('Items must be on the same shelf')
    await requireMembership(rows[0].listId, me.id)

    await db.delete(items).where(inArray(items.id, itemIds))
  })

export const setItemStatus = createServerFn({ method: 'POST' })
  .validator((data: { itemId: string; status: ItemStatus }) => {
    if (!ITEM_STATUSES.includes(data.status)) throw new Error('Unknown status')
    return data
  })
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()
    const item = await db.query.items.findFirst({
      where: eq(items.id, data.itemId),
    })
    if (!item) throw new Error('Item not found')
    await requireMembership(item.listId, me.id)

    await db
      .update(items)
      .set({
        status: data.status,
        completedAt: data.status === 'done' ? new Date() : null,
      })
      .where(eq(items.id, data.itemId))

    if (item.status !== data.status) {
      const action =
        data.status === 'done'
          ? 'completed'
          : data.status === 'abandoned'
            ? 'abandoned'
            : 'reverted'
      await logActivity(item.listId, me.id, action, {
        title: item.title,
        type: item.type,
      })
    }
  })

export const searchMyItems = createServerFn({ method: 'GET' })
  .validator((query: string) => query.trim())
  .handler(async ({ data: query }) => {
    const db = await getDb()
    const me = await requireUser()
    if (query.length < 2) return []

    const memberships = await db
      .select({ listId: listMembers.listId })
      .from(listMembers)
      .where(eq(listMembers.userId, me.id))
    const listIds = memberships.map((m) => m.listId)
    if (listIds.length === 0) return []

    const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`)
    const pattern = `%${escaped}%`
    const rows = await db
      .select({
        item: items,
        listName: lists.name,
      })
      .from(items)
      .innerJoin(lists, eq(items.listId, lists.id))
      .where(
        and(
          inArray(items.listId, listIds),
          or(
            // Qualified names written out: interpolating items.title renders
            // an unqualified column name.
            sql`items.title like ${pattern} escape '\\'`,
            sql`items.notes like ${pattern} escape '\\'`,
          ),
        ),
      )
      .orderBy(desc(items.createdAt))
      .limit(30)

    return rows.map((r) => ({ ...r.item, listName: r.listName }))
  })

const DUSTY_AFTER_DAYS = 60

/** Oldest still-untried items — the ones quietly gathering dust. */
export const getDustyItems = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDb()
    const me = await requireUser()

    const memberships = await db
      .select({ listId: listMembers.listId })
      .from(listMembers)
      .where(eq(listMembers.userId, me.id))
    const listIds = memberships.map((m) => m.listId)
    if (listIds.length === 0) return []

    const cutoff = new Date(Date.now() - DUSTY_AFTER_DAYS * 86_400_000)
    const rows = await db
      .select({
        item: items,
        listName: lists.name,
      })
      .from(items)
      .innerJoin(lists, eq(items.listId, lists.id))
      .where(
        and(
          inArray(items.listId, listIds),
          eq(items.status, 'to_try'),
          lt(items.createdAt, cutoff),
        ),
      )
      .orderBy(items.createdAt)
      .limit(6)

    return rows.map((r) => ({ ...r.item, listName: r.listName }))
  },
)

export const deleteItem = createServerFn({ method: 'POST' })
  .validator((itemId: string) => itemId)
  .handler(async ({ data: itemId }) => {
    const db = await getDb()
    const me = await requireUser()
    const item = await db.query.items.findFirst({
      where: eq(items.id, itemId),
    })
    if (!item) return
    await requireMembership(item.listId, me.id)

    await db.delete(items).where(eq(items.id, itemId))
    await logActivity(item.listId, me.id, 'removed', {
      title: item.title,
      type: item.type,
    })
  })
