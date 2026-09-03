"use client"

import { useEffect, useRef } from "react"

// Keeps PandaStack warm without being a cron ping that gets filtered.
// Cycle: actively warm for 2 min (hits every 20s), then sleep 3 min.
// Respects page visibility and online status - pauses when tab hidden/offline.
// Mounted once in RootLayout so every visit contributes to warm traffic.
export default function WarmAgent() {
  const running = useRef(false)

  useEffect(() => {
    if (running.current) return
    running.current = true

    let stopped = false
    let timeoutId: number | undefined

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        timeoutId = window.setTimeout(resolve, ms) as unknown as number
      })

    const pingWarm = async () => {
      try {
        await fetch("/api/backend/warm", { cache: "no-store" })
      } catch {
        // best effort - next cycle will retry
      }
      try {
        await fetch("/api/backend/health", { cache: "no-store" })
      } catch {
        // ignore
      }
      try {
        await fetch("/api/catalog/snapshot", { cache: "no-store" })
      } catch {
        // ignore
      }
    }

    const loop = async () => {
      while (!stopped) {
        // ACTIVE PHASE: 2 min (~6 pings * 20s)
        const activeEnd = Date.now() + 2 * 60 * 1000
        while (!stopped && Date.now() < activeEnd) {
          const visible = document.visibilityState === "visible"
          const online = navigator.onLine
          if (visible && online) {
            await pingWarm()
          }
          if (stopped) break
          await sleep(20_000)
        }
        if (stopped) break
        // SLEEP PHASE: 3 min (no requests, lets container stay warm but not hammered)
        await sleep(3 * 60 * 1000)
      }
    }

    // Start after first paint + small stagger to avoid competing with LCP
    const startId = window.setTimeout(() => {
      if (!stopped) void loop()
    }, 2500)

    // Also warm immediately on visibility return (user switches back to tab)
    const onVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void pingWarm()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("online", onVisibility)

    return () => {
      stopped = true
      window.clearTimeout(startId)
      if (timeoutId) window.clearTimeout(timeoutId)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("online", onVisibility)
    }
  }, [])

  return null
}
