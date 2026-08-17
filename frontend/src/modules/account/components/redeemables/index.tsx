import LocalizedClientLink from "@modules/common/components/localized-client-link"
import RedeemableCard from "@modules/redeemables/components/redeemable-card"
import type { OwnedRedeemable } from "@lib/data/redeemables"

const typeLabel = (type: string) =>
  type === "gift_card" ? "Gift card" : type === "voucher" ? "Voucher" : "Ticket"

export default function MyRedeemables({ items }: { items: OwnedRedeemable[] }) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Your keepsakes</p>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-[-0.03em] text-ink">Gift cards & passes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Everything sent to you lives here. Use a gift card or voucher at checkout, or show a ticket pass at the venue.</p>
      </div>

      {items.length === 0 ? (
        <div className="glass-panel rounded-control p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-2xl">✦</div>
          <h2 className="mt-4 font-display text-xl font-medium text-ink">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">When someone sends you a gift card, voucher, or ticket, it will appear here as a ready-to-use pass.</p>
          <LocalizedClientLink href="/store" className="figma-button mt-5 inline-flex">Explore stores</LocalizedClientLink>
        </div>
      ) : (
        <div className="grid gap-5 medium:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className={item.status !== "active" ? "opacity-65" : ""}>
              <RedeemableCard
                type={item.type}
                title={item.title}
                message={item.message}
                design={item.design_variant}
                image={item.background_image}
                accentColor={item.accent_color}
                faceValue={item.face_value}
                balance={item.balance}
                discountType={item.discount_type}
                discountValue={item.discount_value}
                code={item.code}
                storeName={item.store?.name}
                storeLogo={item.store?.logo}
                eventName={item.event_name}
                venueName={item.venue_name}
                venueAddress={item.venue_address}
                eventStartsAt={item.event_starts_at}
                eventEndsAt={item.event_ends_at}
                expiresAt={item.expires_at}
                mode="owned"
              />
              <div className="mt-3 flex items-center justify-between gap-3 px-1 text-xs">
                <span className={`rounded-full px-2.5 py-1 font-medium ${item.status === "active" ? "bg-emerald-500/10 text-emerald-700" : "bg-ink/10 text-ink-muted"}`}>
                  {item.status === "active" ? (item.type === "ticket" ? "Ready at the door" : "Ready to use") : item.status}
                </span>
                {item.store?.handle && <LocalizedClientLink href={`/store/${item.store.handle}`} className="text-ink-muted hover:text-ink hover:underline">Visit {item.store.name}</LocalizedClientLink>}
              </div>
              {item.status === "active" && <p className="mt-2 px-1 text-xs leading-5 text-ink-muted">{item.type === "ticket" ? "Show this pass and its code to the venue team. It can only be used once." : `Use the ${typeLabel(item.type).toLowerCase()} code when you check out from ${item.store?.name ?? "the store"}.`}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
