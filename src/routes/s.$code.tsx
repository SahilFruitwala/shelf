import { Link, createFileRoute } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'

import { CATEGORIES, LIST_TYPE_CONFIG, statusLabel } from '#/lib/categories'
import { cn } from '#/lib/utils'
import { getPublicList } from '#/server/lists'

export const Route = createFileRoute('/s/$code')({
  loader: ({ params }) => getPublicList({ data: params.code }),
  component: PublicShelfPage,
})

type PublicList = NonNullable<Awaited<ReturnType<typeof getPublicList>>>
type PublicItem = PublicList['items'][number]

function PublicItemCard({ item }: { item: PublicItem }) {
  const config = CATEGORIES[item.type]
  const Icon = config.icon
  const done = item.status === 'done'
  const subtitle = [
    item.metadata?.year,
    item.metadata?.author,
    item.metadata?.address,
    item.metadata?.rating && `★ ${item.metadata.rating}`,
    item.metadata?.price,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <article
      className={cn(
        'glow-card flex gap-4 rounded-(--radius-card) p-4',
        item.status === 'abandoned' && 'opacity-60',
      )}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className={cn(
            'h-24 w-17 shrink-0 rounded-lg border border-line object-cover',
            done && 'saturate-50',
          )}
        />
      ) : (
        <div className="flex h-24 w-17 shrink-0 items-center justify-center rounded-lg border border-line bg-card-deep">
          <Icon className={cn('size-5', config.textClass)} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display text-[17px] font-semibold leading-snug">
              {item.link ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline underline-offset-2"
                >
                  {item.title}
                  <ExternalLink className="ml-1.5 inline size-3.5 align-baseline text-ink-faint" />
                </a>
              ) : (
                item.title
              )}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-[13px] text-ink-faint">{subtitle}</p>
            )}
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
              done
                ? cn(config.bgClass, 'text-white dark:text-black/80')
                : item.status === 'abandoned'
                  ? 'bg-card-deep text-ink-faint'
                  : cn('bg-card-deep', config.textClass),
            )}
          >
            {statusLabel(item.type, item.status)}
          </span>
        </div>
        {item.notes && (
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
            {item.notes}
          </p>
        )}
      </div>
    </article>
  )
}

function PublicShelfPage() {
  const list = Route.useLoaderData()

  return (
    <div className="mx-auto min-h-dvh w-full max-w-5xl px-4 pb-24 sm:px-8">
      <header className="mb-2 flex items-center justify-between border-b border-line py-3 sm:py-4">
        <Link to="/" className="font-display text-[22px] font-bold">
          Shelf
          <span className="text-accent">.</span>
        </Link>
      </header>

      {!list ? (
        <main className="mx-auto max-w-md py-16 text-center">
          <h1 className="font-display text-2xl font-semibold">
            This shelf isn't shared anymore
          </h1>
          <p className="mt-2 text-[15px] text-ink-soft">
            The link may have been turned off by the shelf's owner.
          </p>
        </main>
      ) : (
        <main className="pt-6">
          <div className="mb-6">
            <p
              className={cn(
                'text-[13px] font-semibold uppercase tracking-wide',
                LIST_TYPE_CONFIG[list.type].textClass,
              )}
            >
              {LIST_TYPE_CONFIG[list.type].label}
            </p>
            <h1 className="text-hero mt-1 font-display text-3xl font-bold sm:text-4xl">
              {list.name}
            </h1>
            <p className="mt-1.5 text-[14px] text-ink-soft">
              A shelf shared by {list.ownerName} · view only
            </p>
          </div>

          {list.items.length === 0 ? (
            <p className="py-12 text-center text-[15px] text-ink-faint">
              Nothing on this shelf yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {list.items.map((item) => (
                <PublicItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </main>
      )}
    </div>
  )
}
