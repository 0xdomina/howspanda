"use client"

import { useCallback, useEffect, useState } from "react"
import type { ReactNode } from "react"

const MAX_WAIT_MS = 30_000
const POLL_MS = 2_500
const REQUEST_TIMEOUT_MS = 9_000
// Keep the browser on the same origin. The server-side route handles backend
// wake-up checks without exposing CORS or deployment-specific URLs to users.
const BACKEND_HEALTH_URL = "/api/backend/health"

type WarmupState = "checking" | "ready" | "error"

const BackendWarmupGate = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<WarmupState>("checking")
  const [attempt, setAttempt] = useState(0)

  const checkHealth = useCallback(async () => {
    const controller = new AbortController()
    const timeout = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    )

    try {
      const response = await fetch(BACKEND_HEALTH_URL, {
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
        signal: controller.signal,
      })
      const body = (await response.json().catch(() => null)) as {
        ready?: boolean
      } | null

      return response.ok && body?.ready === true
    } catch {
      return false
    } finally {
      window.clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    let active = true
    let timer: number | undefined
    const startedAt = Date.now()

    const poll = async () => {
      const ready = await checkHealth()

      if (!active) {
        return
      }

      if (ready) {
        setState("ready")
        return
      }

      if (Date.now() - startedAt >= MAX_WAIT_MS) {
        setState("error")
        return
      }

      timer = window.setTimeout(() => void poll(), POLL_MS)
    }

    void poll()

    return () => {
      active = false
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [attempt, checkHealth])

  if (state === "ready") {
    return <>{children}</>
  }

  if (state === "error") {
    return (
      <div
        className="flex min-h-[320px] flex-col items-center justify-center gap-5 text-center"
        data-testid="account-warmup"
        role="alert"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-paper">
          <span className="text-lg" aria-hidden="true">
            ↗
          </span>
        </div>
        <div className="max-w-sm space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Almost there
          </h1>
          <p className="text-sm leading-6 text-ink-muted">
            It is taking a little longer to open. Try again in a moment.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setState("checking")
            setAttempt((value) => value + 1)
          }}
          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper transition duration-200 hover:opacity-85 active:scale-[0.97]"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex min-h-[320px] flex-col items-center justify-center gap-5 text-center"
      data-testid="account-warmup"
      role="status"
      aria-live="polite"
    >
      <div
        className="h-10 w-10 rounded-full border-2 border-ink/15 border-t-ink motion-safe:animate-spin"
        aria-hidden="true"
      />
      <div className="max-w-sm space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Getting things ready
        </h1>
        <p className="text-sm leading-6 text-ink-muted">
          Your account space will be ready in just a moment.
        </p>
      </div>
    </div>
  )
}

export default BackendWarmupGate
