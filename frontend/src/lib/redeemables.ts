// Derived giftcard display states (no migration, no writes).
// The amount on a card is fixed forever: `redeemed` reads as Spent,
// an `active` card drawn below face value reads as Partially used,
// `expired` and `cancelled` pass through unchanged.

export type RedeemableDisplayState =
  | "Active"
  | "Partially used"
  | "Spent"
  | "Expired"
  | "Cancelled"
  | "Unknown"

type RedeemableLike = {
  status?: string | null
  balance?: number | string | null
  face_value?: number | string | null
}

export const redeemableDisplayState = (
  r: RedeemableLike
): RedeemableDisplayState => {
  if (r.status === "redeemed") return "Spent"
  if (r.status === "expired") return "Expired"
  if (r.status === "cancelled") return "Cancelled"
  if (r.status === "active") {
    if (r.balance != null && r.face_value != null) {
      const balance = Number(r.balance)
      const face = Number(r.face_value)
      if (
        Number.isFinite(balance) &&
        Number.isFinite(face) &&
        balance < face
      ) {
        return "Partially used"
      }
    }
    return "Active"
  }
  return "Unknown"
}

// `X of Y left` figures for gift cards carrying both amounts.
export const giftcardProgress = (
  r: RedeemableLike
): { left: number; total: number } | null => {
  if (r.balance == null || r.face_value == null) return null
  const left = Number(r.balance)
  const total = Number(r.face_value)
  if (!Number.isFinite(left) || !Number.isFinite(total)) return null
  return { left, total }
}
