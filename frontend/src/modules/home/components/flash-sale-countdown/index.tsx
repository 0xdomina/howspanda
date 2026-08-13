"use client"

import { useEffect, useState } from "react"

const formatTime = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [days ? `${days}d` : null, hours, minutes, seconds]
    .filter((value) => value !== null)
    .map((value) => typeof value === "number" ? String(value).padStart(2, "0") : value)
    .join(" : ")
}

export default function FlashSaleCountdown({ endsAt }: { endsAt: number }) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, endsAt - Date.now()))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [endsAt])

  return (
    <div className="flex items-center gap-3 text-sm font-semibold text-ink" aria-label="Flash sale countdown">
      <span className="text-center">
        <strong className="block text-xl tabular-nums">{formatTime(remaining)}</strong>
        <span className="text-xs font-medium text-ink-muted">left in this drop</span>
      </span>
    </div>
  )
}
