"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

// Shown on account pages when the visitor HAS a session but the profile
// couldn't load (backend napping, or a stale tab from an older deploy).
// Auto-retries quietly, then offers a full reload: router.refresh() reuses
// the client cache, so a tab stuck on old code needs a real navigation to
// recover. Never a dead end.
export default function AccountWarmup({ title = "Waking up your account" }: { title?: string }) {
  const router = useRouter()
  const [tries, setTries] = useState(0)
  const exhausted = tries >= 6

  useEffect(() => {
    if (exhausted) return
    const t = window.setTimeout(() => {
      setTries((n) => n + 1)
      router.refresh()
    }, 5000)
    return () => window.clearTimeout(t)
  }, [tries, exhausted, router])

  return (
    <section
      className="mx-auto flex min-h-[320px] max-w-xl flex-col items-center justify-center gap-3 px-6 text-center"
      aria-live="polite"
      data-testid="account-warmup"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink/15 border-t-ink" aria-hidden="true" />
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="max-w-sm text-sm leading-6 text-ink-muted">
        {exhausted
          ? "Still loading. Reload to fetch a fresh page."
          : "Your session is fine. Reconnecting your details."}
      </p>
      {exhausted ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-1 rounded-control bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink/90 active:scale-[0.98]"
        >
          Reload now
        </button>
      ) : (
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-1 rounded-control border border-ink-hairline px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-white active:scale-[0.97]"
        >
          Try again now
        </button>
      )}
    </section>
  )
}
