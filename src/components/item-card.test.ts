import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { applyStatusToPage, toggleReactionInList } from './item-card'
import type { ItemsPage, ListWithReactions } from './item-card'
import type { Item } from '#/db/schema'

function item(id: string, status: Item['status'] = 'to_try'): Item {
  return {
    id,
    listId: 'shelf-1',
    type: 'movie',
    title: `Item ${id}`,
    normalizedTitle: `item ${id}`,
    status,
    completedAt: null,
    notes: null,
    link: null,
    imageUrl: null,
    metadata: null,
    addedBy: 'user-1',
    createdAt: new Date(0),
  }
}

const NOW = new Date('2026-07-29T12:00:00Z')

describe('applyStatusToPage', () => {
  it('sets status and completedAt on the target item only', () => {
    const page: ItemsPage = { items: [item('a'), item('b'), item('c')] }
    const next = applyStatusToPage(page, 'b', 'done', NOW)!

    expect(next.items.map((i) => i.status)).toEqual([
      'to_try',
      'done',
      'to_try',
    ])
    expect(next.items[1].completedAt).toEqual(NOW)
    expect(next.items[0].completedAt).toBeNull()
  })

  it('clears completedAt when moving back out of done', () => {
    const page: ItemsPage = { items: [item('a', 'done')] }
    page.items[0].completedAt = NOW

    const next = applyStatusToPage(page, 'a', 'to_try', NOW)!
    expect(next.items[0].status).toBe('to_try')
    expect(next.items[0].completedAt).toBeNull()
  })

  it('does not mutate the cached page in place', () => {
    const page: ItemsPage = { items: [item('a')] }
    const next = applyStatusToPage(page, 'a', 'done', NOW)!

    expect(page.items[0].status).toBe('to_try')
    expect(next).not.toBe(page)
    expect(next.items[0]).not.toBe(page.items[0])
  })

  it('leaves the page alone when the item is on another page', () => {
    const page: ItemsPage = { items: [item('a'), item('b')] }
    const next = applyStatusToPage(page, 'zzz', 'done', NOW)!
    expect(next.items.map((i) => i.status)).toEqual(['to_try', 'to_try'])
  })

  it('passes undefined through for a page that was never cached', () => {
    expect(applyStatusToPage(undefined, 'a', 'done', NOW)).toBeUndefined()
  })
})

describe('optimistic cache patching', () => {
  // The mutation patches by prefix so that every already-fetched page of the
  // shelf updates, not just the one on screen. This pins that behaviour to the
  // real query key layout used by the list route.
  it('patches every cached page of the shelf and no other shelf', () => {
    const qc = new QueryClient()
    const key = (listId: string, filter: string, page: number) => [
      'list',
      listId,
      'items',
      filter,
      [],
      '',
      'recent',
      page,
      24,
    ]

    qc.setQueryData(key('shelf-1', 'all', 1), { items: [item('a')] })
    qc.setQueryData(key('shelf-1', 'to_try', 2), {
      items: [item('a'), item('b')],
    })
    qc.setQueryData(key('shelf-2', 'all', 1), { items: [item('a')] })

    qc.setQueriesData<ItemsPage>(
      { queryKey: ['list', 'shelf-1', 'items'] },
      (old) => applyStatusToPage(old, 'a', 'done', NOW),
    )

    const p1 = qc.getQueryData<ItemsPage>(key('shelf-1', 'all', 1))!
    const p2 = qc.getQueryData<ItemsPage>(key('shelf-1', 'to_try', 2))!
    const other = qc.getQueryData<ItemsPage>(key('shelf-2', 'all', 1))!

    expect(p1.items[0].status).toBe('done')
    expect(p2.items[0].status).toBe('done')
    expect(p2.items[1].status).toBe('to_try')
    // A different shelf must not be touched by the prefix match.
    expect(other.items[0].status).toBe('to_try')
  })

  it('rolls back every patched page on error', () => {
    const qc = new QueryClient()
    const k1 = ['list', 'shelf-1', 'items', 'all', 1]
    const k2 = ['list', 'shelf-1', 'items', 'to_try', 2]
    qc.setQueryData(k1, { items: [item('a')] })
    qc.setQueryData(k2, { items: [item('a')] })

    const previous = qc.getQueriesData<ItemsPage>({
      queryKey: ['list', 'shelf-1', 'items'],
    })
    qc.setQueriesData<ItemsPage>(
      { queryKey: ['list', 'shelf-1', 'items'] },
      (old) => applyStatusToPage(old, 'a', 'done', NOW),
    )
    expect(qc.getQueryData<ItemsPage>(k1)!.items[0].status).toBe('done')

    // What onError does.
    for (const [key, data] of previous) qc.setQueryData(key, data)

    expect(qc.getQueryData<ItemsPage>(k1)!.items[0].status).toBe('to_try')
    expect(qc.getQueryData<ItemsPage>(k2)!.items[0].status).toBe('to_try')
  })
})

describe('toggleReactionInList', () => {
  const list = (
    reactionsByItem: ListWithReactions['reactionsByItem'],
  ): ListWithReactions => ({ reactionsByItem })

  it('adds a reaction when the user has not reacted', () => {
    const next = toggleReactionInList(list({}), 'item-1', 'me', 'Sam')!
    expect(next.reactionsByItem['item-1']).toEqual([
      { userId: 'me', name: 'Sam' },
    ])
  })

  it('removes only my reaction, leaving others intact', () => {
    const next = toggleReactionInList(
      list({
        'item-1': [
          { userId: 'other', name: 'Alex' },
          { userId: 'me', name: 'Sam' },
        ],
      }),
      'item-1',
      'me',
      'Sam',
    )!
    expect(next.reactionsByItem['item-1']).toEqual([
      { userId: 'other', name: 'Alex' },
    ])
  })

  it('round-trips back to the original set', () => {
    const start = list({ 'item-1': [{ userId: 'other', name: 'Alex' }] })
    const once = toggleReactionInList(start, 'item-1', 'me', 'Sam')!
    const twice = toggleReactionInList(once, 'item-1', 'me', 'Sam')!
    expect(twice.reactionsByItem['item-1']).toEqual(
      start.reactionsByItem['item-1'],
    )
  })

  it('leaves other items untouched', () => {
    const next = toggleReactionInList(
      list({ 'item-1': [], 'item-2': [{ userId: 'other', name: 'Alex' }] }),
      'item-1',
      'me',
      'Sam',
    )!
    expect(next.reactionsByItem['item-2']).toEqual([
      { userId: 'other', name: 'Alex' },
    ])
  })

  it('does not mutate the cached list in place', () => {
    const start = list({ 'item-1': [] })
    const next = toggleReactionInList(start, 'item-1', 'me', 'Sam')!
    expect(start.reactionsByItem['item-1']).toEqual([])
    expect(next.reactionsByItem).not.toBe(start.reactionsByItem)
  })

  it('passes undefined through for an uncached list', () => {
    expect(
      toggleReactionInList(undefined, 'item-1', 'me', 'Sam'),
    ).toBeUndefined()
  })
})
