"use client"

import { FormEvent, useState } from "react"
import { useParams, useRouter } from "next/navigation"

export default function SearchForm({ className, inputId = "global-product-search" }: { className?: string; inputId?: string }) {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const [value, setValue] = useState("")

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = value.trim()
    router.push(`/${countryCode}/store${query ? `?q=${encodeURIComponent(query)}` : ""}`)
  }

  return <form onSubmit={submit} role="search" className={className ?? "hidden h-10 items-center gap-3 rounded-control bg-[#f5f5f5] px-4 small:flex"}><label htmlFor={inputId} className="sr-only">Search products</label><input id={inputId} type="search" value={value} onChange={(event) => setValue(event.target.value)} placeholder="What are you looking for?" className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted" /><button type="submit" aria-label="Search products" className="transition-transform duration-fast active:scale-95"><img src="/figma/home/search.svg" alt="" className="h-5 w-5" /></button></form>
}
