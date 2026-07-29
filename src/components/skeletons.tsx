import type { ReactNode } from 'react'

import { cn } from '#/lib/utils'
import { Skeleton } from '#/components/ui'

/**
 * Shared loading skeletons.
 *
 * Every async surface in the app renders a skeleton shaped like the content it
 * is standing in for, so a slow network reads as "this is arriving" instead of
 * a blank screen. Skeleton blocks themselves are `aria-hidden`; screen readers
 * get the status label from `SkeletonScreen` instead.
 */

/** Announces the pending state once, and hides the decorative bars from AT. */
export function SkeletonScreen({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/** A stack of text bars with a shorter last line, like a real paragraph. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                      */
/* -------------------------------------------------------------------------- */

/** Mirrors `ListCard` on the shelves grid. */
export function ListCardSkeleton() {
  return (
    <div className="rounded-(--radius-card) bg-card p-4">
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
    </div>
  )
}

/** Mirrors `ItemCard` — cover thumb on the left, title + meta on the right. */
export function ItemCardSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className="glow-card flex gap-4 rounded-(--radius-card) p-4">
      <Skeleton
        className={cn('shrink-0 rounded-lg', compact ? 'size-11' : 'h-24 w-16')}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className={cn('w-3/5', compact ? 'h-4' : 'h-5')} />
        <Skeleton className="h-3.5 w-2/5" />
        {compact ? null : <Skeleton className="h-3.5 w-1/3" />}
      </div>
    </div>
  )
}

/** Mirrors the media rows in search results / exercise lookup. */
export function MediaRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2">
      <Skeleton className="size-14 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Collections                                                                */
/* -------------------------------------------------------------------------- */

export function ItemGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <ItemCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function MediaListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="mt-4 space-y-1">
      {Array.from({ length: count }, (_, i) => (
        <MediaRowSkeleton key={i} />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Page-level skeletons                                                       */
/* -------------------------------------------------------------------------- */

/** `/` — shelves grid. */
export function ShelvesPageSkeleton() {
  return (
    <SkeletonScreen label="Loading your shelves" className="block">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>

      <Skeleton className="mb-6 h-11 w-full" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <ListCardSkeleton key={i} />
        ))}
      </div>
    </SkeletonScreen>
  )
}

/** `/list/$listId` — one shelf with its toolbar and items. */
export function ListPageSkeleton() {
  return (
    <SkeletonScreen label="Loading shelf" className="block">
      <Skeleton className="mb-6 h-4 w-32" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-36" />
      </div>

      <ItemGridSkeleton />
    </SkeletonScreen>
  )
}

/** `/s/$code` — the public read-only shelf. */
export function PublicShelfPageSkeleton() {
  return (
    <SkeletonScreen
      label="Loading shelf"
      className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8"
    >
      <div className="mb-8 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-40" />
      </div>
      <ItemGridSkeleton count={4} />
    </SkeletonScreen>
  )
}

/** `/settings` — account details card. */
export function SettingsPageSkeleton() {
  return (
    <SkeletonScreen label="Loading settings" className="mx-auto max-w-2xl py-6">
      <Skeleton className="h-8 w-40" />
      <div className="mt-8 space-y-4">
        <Skeleton className="h-3.5 w-24" />
        <div className="rounded-(--radius-card) border border-line bg-card px-5 py-4">
          <AccountRowsSkeleton />
        </div>
      </div>
      <div className="mt-10 space-y-4">
        <Skeleton className="h-3.5 w-28" />
        <div className="rounded-(--radius-card) border border-line bg-card px-5 py-4">
          <Skeleton className="h-4 w-36" />
          <SkeletonText lines={2} className="mt-3" />
          <Skeleton className="mt-4 h-10 w-36" />
        </div>
      </div>
    </SkeletonScreen>
  )
}

/** The name / email / member-since rows inside the settings account card. */
export function AccountRowsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex justify-between gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex justify-between gap-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  )
}

/** `/exercises` — search page shell before the first query resolves. */
export function ExercisesPageSkeleton() {
  return (
    <SkeletonScreen label="Loading exercises" className="mx-auto max-w-xl py-4">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
      <Skeleton className="h-11 w-full" />
      <MediaListSkeleton />
    </SkeletonScreen>
  )
}

/** `/workouts` — routines grid over the day-by-day history. */
export function WorkoutsPageSkeleton() {
  return (
    <SkeletonScreen label="Loading your workouts" className="block">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-10 w-44 rounded-full" />
      </div>
      <Skeleton className="mb-3 h-3.5 w-24" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-(--radius-card)" />
        ))}
      </div>
      <Skeleton className="mb-3 mt-10 h-3.5 w-20" />
      <Skeleton className="h-64 rounded-(--radius-card)" />
    </SkeletonScreen>
  )
}

/** `/workouts/$sessionId` — the set-by-set logging screen. */
export function WorkoutSessionSkeleton() {
  return (
    <SkeletonScreen
      label="Loading this workout"
      className="mx-auto block max-w-2xl"
    >
      <Skeleton className="mb-4 h-4 w-28" />
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-2 h-6 w-48" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-(--radius-card)" />
        ))}
      </div>
    </SkeletonScreen>
  )
}

/** `/join/$code` — the invite preview card. */
export function JoinPreviewSkeleton() {
  return (
    <SkeletonScreen
      label="Checking invite"
      className="mx-auto flex max-w-md flex-col items-center py-16"
    >
      <Skeleton className="size-16 rounded-full" />
      <Skeleton className="mt-5 h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-72" />
      <Skeleton className="mt-6 h-11 w-36" />
    </SkeletonScreen>
  )
}

/** Full-page fallback for routes without a bespoke skeleton. */
export function GenericPageSkeleton() {
  return (
    <SkeletonScreen label="Loading" className="py-8">
      <Skeleton className="h-9 w-1/3" />
      <Skeleton className="mt-3 h-4 w-1/2" />
      <SkeletonText lines={6} className="mt-8" />
    </SkeletonScreen>
  )
}

/* -------------------------------------------------------------------------- */
/* Inline skeletons                                                           */
/* -------------------------------------------------------------------------- */

/** Streaming providers strip inside an item card. */
export function WatchWhereSkeleton() {
  return (
    <SkeletonScreen
      label="Finding where to watch"
      className="mt-2 flex flex-wrap items-center gap-1.5"
    >
      <Skeleton className="h-4 w-20" />
      <Skeleton className="size-7 rounded-md" />
      <Skeleton className="size-7 rounded-md" />
      <Skeleton className="size-7 rounded-md" />
    </SkeletonScreen>
  )
}
