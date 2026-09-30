// Effective delivery for a product: per-product metadata.delivery overrides
// the store default. Modes: fixed (buyer pays fee with the order), free
// (seller absorbs), courier (buyer arranges a courier / job auto-posts).
// Anything unset falls back to courier-request flow (today's behavior).

export type DeliveryMode = "fixed" | "free" | "courier"

export type ResolvedDelivery = {
  mode: DeliveryMode
  /** Minor units (kobo). Meaningful for fixed; 0 otherwise. */
  fee: number
}

type ProductMeta = {
  delivery?: { mode?: string; fee?: number }
}

type SellerDefaults = {
  delivery_fee?: number | null
  free_delivery?: boolean | null
}

function toMinor(n: unknown): number {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.round(v)
}

export function resolveDelivery(
  productMetadata: ProductMeta | null | undefined,
  seller: SellerDefaults | null | undefined
): ResolvedDelivery {
  const override = productMetadata?.delivery
  const mode = (override?.mode ?? "").toLowerCase()
  if (mode === "fixed") return { mode, fee: toMinor(override?.fee) }
  if (mode === "free") return { mode: "free", fee: 0 }
  if (mode === "courier") return { mode: "courier", fee: 0 }

  // Store default.
  if (seller?.free_delivery) return { mode: "free", fee: 0 }
  const storeFee = toMinor(seller?.delivery_fee)
  if (storeFee > 0) return { mode: "fixed", fee: storeFee }
  return { mode: "courier", fee: 0 }
}
