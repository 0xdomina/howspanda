"use client"

import { useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type QuickViewItem = {
  title: string
  description?: string | null
  thumbnail?: string | null
  price?: string
  href?: string
}

export default function QuickView({ item }: { item: QuickViewItem }) {
  const [open, setOpen] = useState(false)

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setOpen((current) => !current)
  }

  return (
    <>
      <button type="button" aria-label={`Quick view ${item.title}`} aria-expanded={open} onClick={toggle} className="grid h-8 w-8 place-items-center rounded-full bg-white text-sm transition-all duration-fast active:scale-95">{open ? "×" : "◉"}</button>
      {open && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label={`Quick view ${item.title}`} onClick={() => setOpen(false)}>
        <div className="soft-glass grid w-full max-w-2xl gap-6 rounded-large p-5 small:grid-cols-2 small:p-8" onClick={(event) => event.stopPropagation()}>
          <div className="overflow-hidden rounded-control bg-[#f5f5f5]">{item.thumbnail ? <img src={item.thumbnail} alt="" className="aspect-square h-full w-full object-contain p-8" /> : <div className="aspect-square" />}</div>
          <div className="flex flex-col justify-center"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Quick view</p><h2 className="mt-3 font-display text-3xl font-semibold text-ink">{item.title}</h2>{item.price && <p className="mt-4 text-lg font-semibold text-brand">{item.price}</p>}{item.description && <p className="mt-4 text-sm leading-6 text-ink-muted">{item.description}</p>}<div className="mt-8 flex flex-wrap gap-3"><LocalizedClientLink href={item.href || "/store"} className="figma-button">View product</LocalizedClientLink><button type="button" onClick={() => setOpen(false)} className="rounded-control border border-ink-hairline px-5 py-3 text-sm font-semibold text-ink">Close</button></div></div>
        </div>
      </div>}
    </>
  )
}
