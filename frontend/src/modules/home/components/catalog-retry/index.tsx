"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const healthUrls = [
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
    ? `${process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL.replace(/\/$/, "")}/health`
    : null,
  "/api/backend/health",
].filter((url): url is string => Boolean(url))

const CatalogRetry = () => {
  const router = useRouter()

  useEffect(() => {
    let attempts = 0
    let stopped = false
    let intervalId: number | undefined

    const checkHealth = async () => {
      attempts += 1

      for (const url of healthUrls) {
        try {
          const response = await fetch(url, {
            cache: "no-store",
            headers: { accept: "application/json" },
          })
          const body = (await response.json().catch(() => null)) as {
            ready?: boolean
          } | null

          if (body?.ready === true) {
            if (intervalId) window.clearInterval(intervalId)
            if (!stopped) router.refresh()
            return
          }
        } catch {
          // The next health check will quietly try the other route again.
        }
      }

      if (attempts >= 12 && intervalId) {
        window.clearInterval(intervalId)
      }
    }

    const initialId = window.setTimeout(checkHealth, 2000)
    intervalId = window.setInterval(checkHealth, 5000)

    return () => {
      stopped = true
      window.clearTimeout(initialId)
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [router])

  return null
}

export default CatalogRetry
