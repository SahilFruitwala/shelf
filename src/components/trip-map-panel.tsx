import { lazy, Suspense } from 'react'

import type { MapPinItem } from '#/components/trip-map'
import { Spinner } from '#/components/ui'
import { cn } from '#/lib/utils'

const TripMap = lazy(() =>
  import('#/components/trip-map').then((m) => ({ default: m.TripMap })),
)

/** Match the list column — explicit height so Leaflet can fill the panel. */
const MAP_PANEL_HEIGHT = 'min(calc(100dvh - 10rem), 680px)'

export function TripMapPanel({
  pins,
  focus,
  dark,
  className,
}: {
  pins: Array<MapPinItem>
  focus: { lat: number; lng: number } | null
  dark: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-(--radius-card) border border-line bg-card shadow-sm',
        className,
      )}
      style={{ height: MAP_PANEL_HEIGHT }}
    >
      <div className="shrink-0 border-b border-line px-3 py-2.5">
        <p className="text-[13px] font-medium text-ink-soft">
          {pins.length === 0
            ? 'Map'
            : `${pins.length} spot${pins.length === 1 ? '' : 's'} on map`}
        </p>
      </div>

      <div className="relative min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-[14px] text-ink-faint">
              <Spinner />
            </div>
          }
        >
          <TripMap
            pins={pins}
            focus={focus}
            dark={dark}
            embedded
            className="absolute inset-0"
          />
        </Suspense>
      </div>
    </div>
  )
}
