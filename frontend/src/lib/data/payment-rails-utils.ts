export type RailStatus = {
  key: string
  providerId: string
  label: string
  kind: "fiat-card" | "crypto" | "manual"
  enabled: boolean
  mode: "mock" | "test" | "live"
}

export type PaymentRailsResponse = { rails: RailStatus[] }

/**
 * Rails that can move money OUT (payouts / withdrawals). Used to gate the
 * withdraw UI when the rails list is empty, i.e. when the fetch failed.
 */
export const WITHDRAWAL_RAILS = ["paystack", "crypto-usdc"]

/**
 * Enabled rail keys. When the rails list is empty (fetch failed), every rail
 * is treated as available rather than hiding every payout/withdrawal option.
 */
export const getEnabledRailKeys = (rails: RailStatus[]): string[] => {
  if (rails.length === 0) {
    return [...WITHDRAWAL_RAILS]
  }
  return rails.filter((r) => r.enabled).map((r) => r.key)
}
