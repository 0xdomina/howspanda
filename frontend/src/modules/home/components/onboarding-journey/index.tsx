"use client"

import { useEffect, useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"

const STORAGE_KEY = "hows-u:onboarding:v1"

export default function OnboardingJourney() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setVisible(window.localStorage.getItem(STORAGE_KEY) !== "done")
      } catch {
        setVisible(true)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const dismiss = () => {
    setVisible(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, "done")
    } catch {
      // Dismissal still applies for this visit if storage is unavailable.
    }
  }

  if (!visible) return null

  return (
    <aside className="figma-container pb-8 small:pb-12" aria-label="Quick start guide">
      <div className="soft-glass rounded-[24px] p-5 small:p-7">
        <div className="flex flex-col gap-5 small:flex-row small:items-center small:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">A quick start</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Make the most of your first minute</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
              Browse independent stores, save finds you love, and unlock more ways to participate whenever you’re ready.
            </p>
          </div>
          <button type="button" onClick={dismiss} className="shrink-0 self-start text-sm text-ink-muted underline decoration-ink/20 underline-offset-4 transition-colors duration-200 hover:text-ink small:self-center">
            Skip for now
          </button>
        </div>
        <div className="mt-6 grid gap-3 small:grid-cols-3">
          <LocalizedClientLink href="/store" onClick={dismiss} className="rounded-control border border-ink-hairline bg-white/50 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white active:scale-[0.98]">
            <span className="text-lg" aria-hidden="true">01</span>
            <span className="mt-2 block text-sm font-semibold text-ink">Explore products</span>
            <span className="mt-1 block text-xs leading-5 text-ink-muted">Find something that fits your day.</span>
          </LocalizedClientLink>
          <LocalizedClientLink href="/wishlist" onClick={dismiss} className="rounded-control border border-ink-hairline bg-white/50 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white active:scale-[0.98]">
            <span className="text-lg" aria-hidden="true">02</span>
            <span className="mt-2 block text-sm font-semibold text-ink">Save a favourite</span>
            <span className="mt-1 block text-xs leading-5 text-ink-muted">Keep good finds close by.</span>
          </LocalizedClientLink>
          <LocalizedClientLink href="/account" onClick={dismiss} className="rounded-control border border-ink-hairline bg-white/50 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white active:scale-[0.98]">
            <span className="text-lg" aria-hidden="true">03</span>
            <span className="mt-2 block text-sm font-semibold text-ink">Make it yours</span>
            <span className="mt-1 block text-xs leading-5 text-ink-muted">Open a store or explore courier tools when ready.</span>
          </LocalizedClientLink>
        </div>
      </div>
    </aside>
  )
}
