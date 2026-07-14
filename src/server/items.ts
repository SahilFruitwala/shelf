import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'

import { db } from '#/db'
import { ITEM_STATUSES, ITEM_TYPES, items } from '#/db/schema'
import type { ItemStatus, ItemType } from '#/db/schema'
import {
  getOrCreateDefaultList,
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
    link: data.link?.trim() || undefined,
    imageUrl: data.imageUrl?.trim() || undefined,
  }
}

export const addItem = createServerFn({ method: 'POST' })
  .validator(cleanItemInput)
  .handler(async ({ data }) => {
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
    return { id, listId }
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
        ...(data.link !== undefined && { link: data.link.trim() || null }),
        ...(data.imageUrl !== undefined && {
          imageUrl: data.imageUrl.trim() || null,
        }),
        ...(data.metadata !== undefined && { metadata: data.metadata }),
      })
      .where(eq(items.id, data.itemId))
  })

export const setItemStatus = createServerFn({ method: 'POST' })
  .validator((data: { itemId: string; status: ItemStatus }) => {
    if (!ITEM_STATUSES.includes(data.status)) throw new Error('Unknown status')
    return data
  })
  .handler(async ({ data }) => {
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
  })

export const deleteItem = createServerFn({ method: 'POST' })
  .validator((itemId: string) => itemId)
  .handler(async ({ data: itemId }) => {
    const me = await requireUser()
    const item = await db.query.items.findFirst({
      where: eq(items.id, itemId),
    })
    if (!item) return
    await requireMembership(item.listId, me.id)

    await db.delete(items).where(eq(items.id, itemId))
  })
