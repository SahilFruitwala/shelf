import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, ListVideo } from 'lucide-react'

import { cn } from '#/lib/utils'
import {
  getSeasonEpisodes,
  getShowSeasons,
  setSeasonWatched,
  toggleEpisode,
} from '#/server/episodes'
import { Spinner } from '#/components/ui'

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min((done / total) * 100, 100) : 0
  return (
    <span className="block h-1 w-full overflow-hidden rounded-full bg-card-deep">
      <span
        className={cn(
          'block h-full rounded-full transition-[width]',
          done >= total && total > 0 ? 'bg-cat-tv' : 'bg-ink-faint',
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  )
}

function SeasonEpisodes({
  itemId,
  season,
  onChanged,
}: {
  itemId: string
  season: number
  onChanged: () => Promise<void>
}) {
  const { data: episodes, isPending } = useQuery({
    queryKey: ['episodes', itemId, season],
    queryFn: () => getSeasonEpisodes({ data: { itemId, season } }),
    staleTime: 1000 * 60 * 60,
  })

  const toggle = useMutation({
    mutationFn: (ep: { season: number; number: number }) =>
      toggleEpisode({ data: { itemId, ...ep } }),
    onSuccess: onChanged,
  })
  const bulk = useMutation({
    mutationFn: (watched: boolean) =>
      setSeasonWatched({
        data: {
          itemId,
          season,
          numbers: (episodes ?? []).map((e) => e.number),
          watched,
        },
      }),
    onSuccess: onChanged,
  })

  if (isPending)
    return (
      <p className="flex items-center gap-2 py-3 pl-6 text-[12px] text-ink-faint">
        <Spinner />
        Loading episodes…
      </p>
    )

  if (!episodes || episodes.length === 0)
    return (
      <p className="py-3 pl-6 text-[12px] text-ink-faint">
        TMDb lists no episodes for this season.
      </p>
    )

  const allWatched = episodes.every((e) => e.watched)

  return (
    <div className="pb-2 pl-6">
      <button
        type="button"
        onClick={() => bulk.mutate(!allWatched)}
        disabled={bulk.isPending}
        className="mb-1 cursor-pointer text-[12px] font-medium text-ink-soft hover:text-ink disabled:opacity-50"
      >
        {allWatched ? 'Clear whole season' : 'Mark whole season watched'}
      </button>
      <ul>
        {episodes.map((e) => (
          <li key={e.number}>
            <button
              type="button"
              onClick={() =>
                toggle.mutate({ season: e.season, number: e.number })
              }
              disabled={toggle.isPending}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md py-1 pr-2 text-left hover:bg-card-deep disabled:opacity-60"
            >
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded border',
                  e.watched
                    ? 'border-ink bg-ink text-bg'
                    : 'border-line bg-card-deep',
                )}
              >
                {e.watched && <Check className="size-3" />}
              </span>
              {/* min-w keeps short codes aligned; long ones (S23E1156) grow
                  instead of spilling into the title. */}
              <span className="min-w-12 shrink-0 text-[12px] tabular-nums text-ink-faint">
                S{e.season}E{e.number}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px]',
                  e.watched ? 'text-ink-soft' : 'text-ink',
                )}
              >
                {e.title}
              </span>
              {e.airDate && (
                <span className="shrink-0 text-[11px] text-ink-faint">
                  {e.airDate.slice(0, 4)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Season-by-season episode ticking for a show, backed by TMDb's episode list. */
export function EpisodeTracker({
  itemId,
  listId,
}: {
  itemId: string
  listId: string
}) {
  const queryClient = useQueryClient()
  const [openSeason, setOpenSeason] = useState<number | null>(null)

  const { data, isPending } = useQuery({
    queryKey: ['seasons', itemId],
    queryFn: () => getShowSeasons({ data: itemId }),
    staleTime: 1000 * 60 * 60,
  })

  // Ticking an episode moves the show's rolled-up counters too.
  const onChanged = async () => {
    await queryClient.invalidateQueries({ queryKey: ['episodes', itemId] })
    await queryClient.invalidateQueries({ queryKey: ['seasons', itemId] })
    await queryClient.invalidateQueries({ queryKey: ['list', listId] })
  }

  // Marks/clears a whole season from its collapsed row, without requiring it
  // to be expanded first — fetches (or reuses) its episode numbers on demand.
  const seasonBulk = useMutation({
    mutationFn: async ({
      season,
      watched,
    }: {
      season: number
      watched: boolean
    }) => {
      const episodes = await queryClient.fetchQuery({
        queryKey: ['episodes', itemId, season],
        queryFn: () => getSeasonEpisodes({ data: { itemId, season } }),
        staleTime: 1000 * 60 * 60,
      })
      return setSeasonWatched({
        data: {
          itemId,
          season,
          numbers: episodes.map((e) => e.number),
          watched,
        },
      })
    },
    onSuccess: onChanged,
  })

  if (isPending)
    return (
      <p className="flex items-center gap-2 py-3 text-[12px] text-ink-faint">
        <Spinner />
        Loading seasons…
      </p>
    )

  if (!data || data.seasons.length === 0)
    return (
      <p className="py-3 text-[12px] text-ink-faint">
        {data?.hasTmdb === false
          ? 'No TMDb match on this item, so there’s no episode list to track.'
          : 'TMDb lists no seasons for this show.'}
      </p>
    )

  return (
    <>
      {data.unmatched > 0 && (
        <p className="mt-2 text-[12px] text-ink-faint">
          {data.unmatched} watched episode{data.unmatched === 1 ? '' : 's'}{' '}
          don’t match TMDb’s season numbering — they still count toward the
          total but won’t appear ticked below.
        </p>
      )}
      <ul className="mt-1 divide-y divide-line border-t border-line">
        {data.seasons.map((s) => {
          const open = openSeason === s.season
          const complete =
            s.episodeCount > 0 && s.watchedCount >= s.episodeCount
          return (
            <li key={s.season}>
              <div className="flex w-full items-center gap-2.5 py-2 hover:bg-card-deep">
                <button
                  type="button"
                  onClick={() => setOpenSeason(open ? null : s.season)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                >
                  <ChevronRight
                    className={cn(
                      'size-3.5 shrink-0 text-ink-faint transition-transform',
                      open && 'rotate-90',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          'truncate text-[13px] font-medium',
                          complete ? 'text-ink-soft' : 'text-ink',
                        )}
                      >
                        {s.name}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                        {s.watchedCount}/{s.episodeCount}
                      </span>
                    </span>
                    <span className="mt-1 block">
                      <ProgressBar
                        done={s.watchedCount}
                        total={s.episodeCount}
                      />
                    </span>
                  </span>
                </button>
                {s.episodeCount > 0 && (
                  <button
                    type="button"
                    title={
                      complete ? 'Clear whole season' : 'Mark whole season watched'
                    }
                    aria-label={
                      complete ? 'Clear whole season' : 'Mark whole season watched'
                    }
                    onClick={() =>
                      seasonBulk.mutate({ season: s.season, watched: !complete })
                    }
                    disabled={seasonBulk.isPending}
                    className={cn(
                      'flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors disabled:opacity-50',
                      complete
                        ? 'border-ink bg-ink text-bg'
                        : 'border-line bg-card-deep hover:border-ink-faint',
                    )}
                  >
                    {complete && <Check className="size-3.5" />}
                  </button>
                )}
              </div>
              {open && (
                <SeasonEpisodes
                  itemId={itemId}
                  season={s.season}
                  onChanged={onChanged}
                />
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** The toggle that reveals the tracker — kept here so the card stays tidy. */
export function EpisodeToggle({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium transition-colors',
        open
          ? 'bg-ink text-bg'
          : 'text-ink-soft hover:bg-card-deep hover:text-ink',
      )}
    >
      <ListVideo className="size-3.5" />
      Episodes
    </button>
  )
}
