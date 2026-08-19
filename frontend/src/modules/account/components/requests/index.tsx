import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type { ProductRequest } from "@lib/data/product-requests"

const labels: Record<string, string> = {
  open: "Sent",
  reviewing: "Being reviewed",
  available: "Available now",
  not_available: "Not available yet",
  closed: "Closed",
}

export default function BuyerRequests({ requests }: { requests: ProductRequest[] }) {
  return (
    <div className="space-y-6">
      <div><h2 className="font-display text-2xl font-medium text-ink">Product requests</h2><p className="mt-1 text-sm text-ink-muted">Ask a store for something you’d love to buy. There’s no chat thread — just a clear update when the store responds.</p></div>
      {requests.length === 0 ? (
        <div className="glass-panel rounded-control p-6 text-sm text-ink-muted">Your requests will appear here.</div>
      ) : (
        <div className="space-y-3">
          {requests.map((item) => (
            <article key={item.id} className="glass-panel rounded-control p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><p className="font-medium text-ink">{item.request}</p><span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-medium text-ink">{labels[item.status] ?? item.status}</span></div>
              {item.seller_note && <p className="mt-3 text-sm text-ink-muted">{item.seller_note}</p>}
              {item.status === "available" && item.product_id && <LocalizedClientLink href={`/products/${item.product_id}`} className="mt-3 inline-block text-sm font-semibold text-ink underline">View the product</LocalizedClientLink>}
              <p className="mt-3 text-xs text-ink-muted">{item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
