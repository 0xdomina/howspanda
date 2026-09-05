"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

// Shown on account pages when the visitor HAS a session but the profile
// couldn't load (backend napping). Auto-retries quietly; never a dead end.
export default function AccountWarmup({ title = "Waking up your account" }: { title?: string }) {
  const router = useRouter()
  const [tries, setTries] = useState(0)

  useEffect(() => {
    if (tries >= 6) return
    const t = window.setTimeout(() => {
      setTries((n) => n + 1)
      router.refresh()
    }, 5000)
    return () => window.clearTimeout(t)
  }, [tries, router])

  return (
    <section
      className="mx-auto flex min-h-[320px] max-w-xl flex-col items-center justify-center gap-3 px-6 text-center"
      aria-live="polite"
      data-testid="account-warmup"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink/15 border-t-ink" aria-hidden="true" />
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="max-w-sm text-sm leading-6 text-ink-muted">
        Your session is fine — we&rsquo;re reconnecting to your details. This
        usually takes a few seconds.
      </p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-1 rounded-control border border-ink-hairline px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-white active:scale-[0.98]"
      >
        Try again now
      </button>
    </section>
  )
}
