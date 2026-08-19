"use client"

import { useState, useTransition } from "react"
import { createProductRequest } from "@lib/data/product-requests"

export default function RequestProduct({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setMessage(null)
    if (!request.trim()) return setMessage("Tell the store what you need first.")
    startTransition(async () => {
      const result = await createProductRequest(handle, request)
      if (result.success) {
        setRequest("")
        setMessage(result.duplicate ? "You already have this request open." : "Request sent. We’ll keep you posted.")
        if (!result.duplicate) setOpen(false)
      } else setMessage(result.error)
    })
  }

  return (
    <div className="mt-5">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-ink-strong px-4 py-2 text-sm font-semibold text-ink transition hover:bg-ink hover:text-white">
          Request something
        </button>
      ) : (
        <div className="glass-panel max-w-xl rounded-control p-4">
          <div className="flex items-start justify-between gap-4">
            <div><p className="font-medium text-ink">Can’t find what you need?</p><p className="mt-1 text-xs text-ink-muted">Send one short request to this store.</p></div>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-muted" aria-label="Close request form">Close</button>
          </div>
          <textarea
            value={request}
            maxLength={100}
            rows={3}
            onChange={(event) => setRequest(event.target.value)}
            placeholder="e.g. The latest Chimamanda book"
            className="mt-3 w-full rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-ink-muted">{request.length}/100</span>
            <button type="button" disabled={isPending || !request.trim()} onClick={submit} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {isPending ? "Sending…" : "Send request"}
            </button>
          </div>
          {message && <p className="mt-3 text-sm text-ink-muted">{message}</p>}
        </div>
      )}
    </div>
  )
}
