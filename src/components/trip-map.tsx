import { memo, useEffect, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

import type { ItemType } from '#/db/schema'
import { CATEGORIES } from '#/lib/categories'
import { cn, mapsDirectionsUrl } from '#/lib/utils'

export type MapPinItem = {
  id: string
  title: string
  type: ItemType
  lat: number
  lng: number
  address?: string
  group?: string
}

L.Marker.prototype.options.icon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const MARKER_COLORS: Partial<Record<ItemType, string>> = {
  restaurant: '#f59e0b',
  place: '#14b8a6',
}

function markerHtml(type: ItemType) {
  const color = MARKER_COLORS[type] ?? '#6366f1'
  const glyph =
    type === 'restaurant'
      ? '<path d="M12 3v7.5M8.5 10.5h7M9 21v-5M15 21v-5M10 14.5h4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'
      : '<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="11" r="2" fill="currentColor"/>'
  return `<div style="width:30px;height:30px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;color:#fff"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none">${glyph}</svg></div>`
}

function markerIconFor(type: ItemType) {
  return L.divIcon({
    html: markerHtml(type),
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  })
}

const DEFAULT_CENTER: [number, number] = [20, 0]

function MapReady() {
  const map = useMap()
  useEffect(() => {
    const run = () => map.invalidateSize()
    run()
    const t1 = window.setTimeout(run, 150)
    const t2 = window.setTimeout(run, 400)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [map])
  return null
}
function FocusController({
  focus,
}: {
  focus: { lat: number; lng: number } | null
}) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.setView([focus.lat, focus.lng], 14)
  }, [focus, map])
  return null
}

function MapResizeObserver() {
  const map = useMap()
  useEffect(() => {
    const root = map.getContainer().closest('.trip-map-root')
    if (!root) return
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(root)
    return () => observer.disconnect()
  }, [map])
  return null
}

function FitBounds({
  pins,
  focus,
}: {
  pins: MapPinItem[]
  focus: { lat: number; lng: number } | null
}) {
  const map = useMap()
  useEffect(() => {
    if (focus) return
    if (pins.length === 0) return
    if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 14)
      return
    }
    const bounds = L.latLngBounds(
      pins.map((p) => [p.lat, p.lng] as [number, number]),
    )
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }, [map, pins, focus])
  return null
}

export const TripMap = memo(function TripMap({
  pins,
  focus,
  dark,
  embedded,
  className,
}: {
  pins: MapPinItem[]
  focus: { lat: number; lng: number } | null
  dark: boolean
  embedded?: boolean
  className?: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <div
        role="status"
        aria-busy="true"
        className={cn(
          'skeleton-fill min-h-[280px] animate-pulse rounded-(--radius-card) border border-line',
          className,
        )}
      >
        <span className="sr-only">Loading map</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'trip-map-root',
        embedded ? 'h-full w-full' : 'relative overflow-hidden',
        !embedded && 'rounded-(--radius-card) border border-line',
        dark && 'dark-tiles-container',
        className,
      )}
    >
      <div className={cn('h-full w-full', dark && 'dark-tiles')}>
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={2}
          className="h-full w-full"
          style={{
            height: '100%',
            width: '100%',
            ...(!embedded ? { minHeight: 280 } : {}),
          }}
          scrollWheelZoom
        >
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapReady />
          <FocusController focus={focus} />
          <MapResizeObserver />
          <FitBounds pins={pins} focus={focus} />
          {pins.map((pin) => (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              icon={markerIconFor(pin.type)}
            >
              <Popup>
                <div className="min-w-[10rem] space-y-1 text-sm text-zinc-900">
                  <p className="font-semibold leading-snug">{pin.title}</p>
                  <p className="text-xs font-medium text-zinc-600">
                    {CATEGORIES[pin.type].label}
                    {pin.group ? ` · ${pin.group}` : ''}
                  </p>
                  {pin.address && (
                    <p className="text-xs text-zinc-500">{pin.address}</p>
                  )}
                  <a
                    href={mapsDirectionsUrl(pin.lat, pin.lng, pin.title)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-block text-xs font-medium text-blue-600 hover:underline"
                  >
                    Open in Maps →
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      {pins.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-card/50 p-8 text-center backdrop-blur-[2px]">
          <p className="max-w-[14rem] text-[13px] leading-relaxed text-ink-faint">
            Add spots via search or a Google Maps link to see pins here.
          </p>
        </div>
      )}
    </div>
  )
})
