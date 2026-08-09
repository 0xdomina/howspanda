// Platform commission schedule — deliberately below marketplace norms so
// sellers keep more and stick around. Where the big players sit (2026):
//   Amazon 8–15% referral (+FBA → 30–40%), eBay ~12.9–15%,
//   Etsy 6.5% + 3% processing (~10–11%), Walmart 6–15%,
//   TikTok Shop 2–8%, Facebook Marketplace 5%, Poshmark ~20%.
// Howsyou: 3–5%, tapering DOWN as order value grows, so big sellers win the
// most and none feel like the platform is taking a cut that hurts.
//
// Boundaries are gross order totals in minor units (kobo). A seller-level
// flat override (seller.commission_rate) still wins when explicitly set.

export type CommissionBand = {
  min: number // gross order total (minor units) at which this band applies
  rate: number // platform commission as a fraction
}

export const COMMISSION_BANDS: CommissionBand[] = [
  { min: 0, rate: 0.05 }, // under ₦100k: 5%
  { min: 100_000, rate: 0.04 }, // ₦100k–₦500k: 4%
  { min: 500_000, rate: 0.035 }, // ₦500k–₦2m: 3.5%
  { min: 2_000_000, rate: 0.03 }, // ₦2m+: 3%
]

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Effective tiered rate for a gross order total (minor units). Falls back to
 * the last band for anything above the highest boundary.
 */
export function commissionRateFor(total: number, overrideRate?: number | null): number {
  if (overrideRate != null && Number.isFinite(overrideRate) && overrideRate > 0) {
    return overrideRate
  }
  let rate = COMMISSION_BANDS[0].rate
  for (const band of COMMISSION_BANDS) {
    if (total >= band.min) {
      rate = band.rate
    }
  }
  return rate
}

/**
 * Commission + net for a gross total, both rounded to 2dp (kobo).
 */
export function computeCommission(total: number, overrideRate?: number | null) {
  const rate = commissionRateFor(total, overrideRate)
  const commission = round2(total * rate)
  return { rate, commission, net: round2(total - commission) }
}