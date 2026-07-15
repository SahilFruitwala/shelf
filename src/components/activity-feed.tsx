import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { DoorOpen, Trash2 } from 'lucide-react'

import type { ActivityAction, ItemType } from '#/db/schema'
import { CATEGORIES } from '#/lib/categories'
import { cn, timeAgo } from '#/lib/utils'
import { getRecentActivity } from '#/server/activity'
import { SectionLabel } from '#/components/ui'

const COMPLETED_VERB: Record<ItemType, string> = {
  restaurant: 'tried',
  movie: 'watched',
  tv: 'watched',
  book: 'read',
  place: 'visited',
  wishlist: 'got',
}

function eventPhrase(
  action: ActivityAction,
  itemType: ItemType | null,
): { verb: string; suffix?: string } {
  switch (action) {
    case 'added':
      return { verb: 'added' }
    case 'completed':
      return { verb: itemType ? COMPLETED_VERB[itemType] : 'checked off' }
    case 'abandoned':
      return { verb: 'passed on' }
    case 'reverted':
      return { verb: 'put', suffix: 'back on the pile' }
    case 'removed':
      return { verb: 'removed' }
    case 'joined':
      return { verb: 'joined' }
  }
}

export function ActivityFeed({ myUserId }: { myUserId?: string }) {
  const { data: events = [] } = useQuery({
    queryKey: ['activity'],
    queryFn: () => getRecentActivity(),
  })

  if (events.length === 0) return null

  return (
    <section className="mt-12">
      <SectionLabel>Recent activity</SectionLabel>
      <div className="glow-card rounded-(--radius-card) px-5 py-2">
        {events.map((e) => {
          const config = e.itemType ? CATEGORIES[e.itemType] : null
          const Icon =
            e.action === 'joined'
              ? DoorOpen
              : e.action === 'removed'
                ? Trash2
                : config?.icon
          const { verb, suffix } = eventPhrase(e.action, e.itemType)
          const actor = e.actorId === myUserId ? 'You' : e.actorName
          return (
            <div
              key={e.id}
              className="flex items-baseline gap-3 border-b border-line py-2.5 text-[14px] last:border-b-0"
            >
              {Icon && (
                <Icon
                  className={cn(
                    'size-4 shrink-0 self-center',
                    e.action === 'removed' || e.action === 'joined'
                      ? 'text-ink-faint'
                      : config?.textClass,
                  )}
                />
              )}
              <p className="min-w-0 flex-1 text-ink-soft">
                <span className="font-medium text-ink">{actor}</span> {verb}{' '}
                {e.itemTitle && (
                  <span className="font-medium text-ink">{e.itemTitle}</span>
                )}{' '}
                {suffix ? (
                  <>{suffix} on </>
                ) : e.action === 'joined' ? null : e.action === 'removed' ? (
                  'from '
                ) : e.action === 'added' ? (
                  'to '
                ) : (
                  'on '
                )}
                <Link
                  to="/list/$listId"
                  params={{ listId: e.listId }}
                  className="text-ink-soft underline-offset-2 hover:text-ink hover:underline"
                >
                  {e.listName}
                </Link>
              </p>
              <span className="shrink-0 text-[12px] text-ink-faint">
                {timeAgo(e.createdAt)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
