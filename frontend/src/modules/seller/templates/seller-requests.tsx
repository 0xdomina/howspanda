"use client"

import { useState, useTransition } from "react"
import { updateSellerProductRequest, type ProductRequest } from "@lib/data/product-requests"
import type { SellerProduct } from "@lib/data/seller"

const statusLabels: Record<string, string> = { open: "New", reviewing: "Reviewing", available: "Available", not_available: "Not available", closed: "Closed" }

function RequestCard({ request, products, onUpdated }: { request: ProductRequest; products: SellerProduct[]; onUpdated: (next: ProductRequest) => void }) {
  const [status, setStatus] = useState<"reviewing" | "available" | "not_available" | "closed">(request.status === "open" ? "reviewing" : request.status === "available" ? "available" : request.status === "not_available" ? "not_available" : "closed")
  const [productId, setProductId] = useState(request.product_id ?? "")
  const [note, setNote] = useState(request.seller_note ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const save = () => startTransition(async () => {
    setMessage(null)
    const result = await updateSellerProductRequest(request.id, { status, seller_note: note, product_id: productId || undefined })
    if (result.success && result.request) { onUpdated(result.request); setMessage("Buyer updated.") } else setMessage(result.error)
  })

  return <article className="glass-panel rounded-control p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.14em] text-ink-muted">{statusLabels[request.status] ?? request.status}</p><p className="mt-1 font-medium text-ink">{request.request}</p></div><p className="text-xs text-ink-muted">{request.created_at ? new Date(request.created_at).toLocaleDateString() : ""}</p></div>
    <div className="mt-4 grid gap-3 small:grid-cols-[180px_1fr]">
      <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink"><option value="reviewing">Reviewing</option><option value="available">Available now</option><option value="not_available">Can’t stock it</option><option value="closed">Close request</option></select>
      {status === "available" ? <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink"><option value="">Choose the available product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select> : <div />}
    </div>
    <textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional update for the buyer" className="mt-3 w-full rounded-medium border border-ink-hairline bg-white/70 px-3 py-2 text-sm text-ink" />
    <div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-ink-muted">One update, no conversation thread.</span><button type="button" disabled={isPending} onClick={save} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving…" : "Send update"}</button></div>
    {message && <p className="mt-2 text-sm text-ink-muted">{message}</p>}
  </article>
}

export default function SellerRequests({ initial, products }: { initial: ProductRequest[]; products: SellerProduct[] }) {
  const [items, setItems] = useState(initial)
  return <div className="space-y-6"><div><h2 className="font-display text-2xl font-medium text-ink">Requests</h2><p className="mt-1 text-sm text-ink-muted">See what buyers are looking for and send a simple availability update.</p></div>{items.length === 0 ? <div className="glass-panel rounded-control p-6 text-sm text-ink-muted">No product requests yet.</div> : <div className="space-y-3">{items.map((item) => <RequestCard key={item.id} request={item} products={products} onUpdated={(next) => setItems((current) => current.map((x) => x.id === next.id ? next : x))} />)}</div>}</div>
}
