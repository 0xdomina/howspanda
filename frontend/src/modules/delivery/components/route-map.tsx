"use client"

import { useEffect, useRef, useState } from "react"

export type RouteMapPoint = {
  lat: number
  lng: number
  label?: string
  kind?: "pickup" | "destination"
}

type RouteMapProps = {
  points: RouteMapPoint[]
  height?: number
}

/**
 * OSM/Leaflet map with pickup + destination markers. Leaflet is loaded lazily
 * in the browser only (no SSR) so the map never breaks the server render.
 */
const RouteMap = ({ points, height = 260 }: RouteMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    Promise.all([import("leaflet")])
      .then(async ([L]) => {
        if (cancelled) return
        const { default: leaflet } = L as any

        const valid = points.filter(
          (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
        )
        if (valid.length === 0) return

        const bounds = leaflet.latLngBounds(valid.map((p) => [p.lat, p.lng]))
        const map = leaflet.map(containerRef.current, {
          scrollWheelZoom: false,
        })
        map.fitBounds(bounds, { padding: [24, 24] })
        mapRef.current = map

        leaflet
          .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          })
          .addTo(map)

        const pickup = valid.find((p) => p.kind === "pickup") ?? valid[0]
        const destination =
          valid.find((p) => p.kind === "destination") ?? valid[valid.length - 1]

        const pickupIcon = leaflet.divIcon({
          className: "",
          html: '<div style="background:#111827;border:3px solid #fff;border-radius:9999px;width:14px;height:14px;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        })
        const destIcon = leaflet.divIcon({
          className: "",
          html: '<div style="background:#059669;border:3px solid #fff;border-radius:9999px;width:14px;height:14px;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        })

        leaflet
          .marker([pickup.lat, pickup.lng], {
            icon: pickupIcon,
            title: pickup.label ?? "Pickup",
          })
          .addTo(map)
          .bindPopup(`<b>${pickup.label ?? "Pickup"}</b>`)
        leaflet
          .marker([destination.lat, destination.lng], {
            icon: destIcon,
            title: destination.label ?? "Destination",
          })
          .addTo(map)
          .bindPopup(`<b>${destination.label ?? "Destination"}</b>`)

        if (valid.length === 2) {
          leaflet
            .polyline(
              [
                [pickup.lat, pickup.lng],
                [destination.lat, destination.lng],
              ],
              { color: "#111827", weight: 2, dashArray: "6 6" }
            )
            .addTo(map)
        }

        setReady(true)
      })
      .catch(() => {})

    return () => {
      cancelled = true
      mapRef.current?.remove?.()
      mapRef.current = null
    }
  }, [JSON.stringify(points)])

  return (
    <div>
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full overflow-hidden rounded-large border border-ink-hairline"
      />
      {!ready && (
        <p className="mt-1 text-xs text-ink-muted">Loading map…</p>
      )}
    </div>
  )
}

export default RouteMap
