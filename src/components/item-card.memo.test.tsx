// @vitest-environment jsdom
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Item } from '#/db/schema'
import type * as Utils from '#/lib/utils'

// `cn` runs many times per ItemCard render and nowhere else in this tree, so
// counting its calls is a direct read on whether the card re-rendered.
const cnCalls = { n: 0 }
vi.mock('#/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof Utils>()
  return {
    ...actual,
    cn: (...args: Array<unknown>) => {
      cnCalls.n++
      return (actual.cn as (...a: Array<unknown>) => string)(...args)
    },
  }
})

// The card imports server functions at module scope; they must not be invoked.
vi.mock('#/server/items', () => ({
  deleteItem: vi.fn(),
  moveItem: vi.fn(),
  setItemStatus: vi.fn(),
  updateItem: vi.fn(),
}))
vi.mock('#/server/episodes', () => ({ setShowWatched: vi.fn() }))
vi.mock('#/server/lists', () => ({ getMyLists: vi.fn(async () => []) }))
vi.mock('#/server/lookup', () => ({ fetchWatchProviders: vi.fn(async () => []) }))
vi.mock('#/server/reactions', () => ({ toggleReaction: vi.fn() }))
vi.mock('#/components/episode-tracker', () => ({
  EpisodeToggle: () => null,
  EpisodeTracker: () => null,
}))

const { ItemCard } = await import('./item-card')

function makeItem(id: string): Item {
  return {
    id,
    listId: 'shelf-1',
    type: 'book',
    title: `Item ${id}`,
    status: 'to_try',
    completedAt: null,
    notes: null,
    link: null,
    imageUrl: null,
    metadata: null,
    addedBy: 'user-1',
    createdAt: new Date(0),
  }
}

const ITEM = makeItem('a')
const MEMBER_NAMES: ReadonlyMap<string, string> = new Map([['user-1', 'Sam']])
const noop = () => {}

/** Parent that re-renders on its own state without changing the card's props. */
function Harness() {
  const [tick, setTick] = useState(0)
  return (
    <>
      <button onClick={() => setTick((t) => t + 1)}>bump</button>
      <span data-testid="tick">{tick}</span>
      <ItemCard
        item={ITEM}
        listId="shelf-1"
        showType={false}
        memberNames={MEMBER_NAMES}
        myUserId="user-1"
        onToggleSelect={noop}
        onShowOnMap={noop}
        canShowOnMap={false}
      />
    </>
  )
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

describe('ItemCard memoization', () => {
  beforeEach(() => {
    cnCalls.n = 0
  })
  afterEach(() => {
    // Explicit because vitest `globals` is off, so RTL's auto-cleanup hook
    // never registers and mounted trees would leak between tests.
    cleanup()
    vi.clearAllMocks()
  })

  it('is wrapped in React.memo', () => {
    expect((ItemCard as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.memo'),
    )
  })

  it('does not re-render when the parent re-renders with unchanged props', () => {
    render(wrap(<Harness />))
    expect(screen.getByText('Item a')).toBeTruthy()

    const afterMount = cnCalls.n
    expect(afterMount).toBeGreaterThan(0) // the card really did render

    fireEvent.click(screen.getByText('bump'))
    expect(screen.getByTestId('tick').textContent).toBe('1') // parent re-rendered
    const afterBump = cnCalls.n

    fireEvent.click(screen.getByText('bump'))
    expect(screen.getByTestId('tick').textContent).toBe('2')

    // The parent re-rendered twice; the memoized card should not have.
    expect(afterBump).toBe(afterMount)
    expect(cnCalls.n).toBe(afterMount)
  })

  // Executable note on why the parent memoizes `memberNames` and hands down
  // stable callbacks: the memo is only as good as the props feeding it, and a
  // fresh object per render silently switches it off.
  it('is defeated by an unstable prop, which is why the parent memoizes', () => {
    function UnstableHarness() {
      const [tick, setTick] = useState(0)
      return (
        <>
          <button onClick={() => setTick((t) => t + 1)}>bump</button>
          <span data-testid="tick">{tick}</span>
          <ItemCard
            item={ITEM}
            listId="shelf-1"
            showType={false}
            // A new Map every render — the pre-fix behaviour.
            memberNames={new Map([['user-1', 'Sam']])}
            myUserId="user-1"
          />
        </>
      )
    }

    render(wrap(<UnstableHarness />))
    const afterMount = cnCalls.n
    fireEvent.click(screen.getByText('bump'))

    expect(cnCalls.n).toBeGreaterThan(afterMount)
  })

  it('does re-render when a prop genuinely changes', () => {
    const { rerender } = render(
      wrap(
        <ItemCard
          item={ITEM}
          listId="shelf-1"
          showType={false}
          memberNames={MEMBER_NAMES}
          myUserId="user-1"
        />,
      ),
    )
    const afterMount = cnCalls.n

    rerender(
      wrap(
        <ItemCard
          item={makeItem('b')}
          listId="shelf-1"
          showType={false}
          memberNames={MEMBER_NAMES}
          myUserId="user-1"
        />,
      ),
    )

    expect(cnCalls.n).toBeGreaterThan(afterMount)
    expect(screen.getByText('Item b')).toBeTruthy()
  })
})
