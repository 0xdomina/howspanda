/**
 * Payment fee model + cheapest-provider routing.
 *
 * All amounts are in the currency's MINOR unit (kobo for NGN = NGN * 100),
 * matching how Medusa stores payment amounts. Fees are computed deterministically
 * here in code; providers never invent totals.
 *
 * Nigeria fee schedules (local transactions), as of the Phase 4 research:
 *   - Paystack:    1.5% + ₦100, the ₦100 flat is waived under ₦2,500, cap ₦2,000
 *   - Flutterwave: 1.4%, cap ₦2,000
 *   - crypto-usdc: no platform fee (network gas is abstracted by the settlement layer)
 */

// Provider ids follow Medusa's `pp_{identifier}_{id}` convention.
export const PAYSTACK_ID = "pp_paystack_paystack"
export const FLUTTERWAVE_ID = "pp_flutterwave_flutterwave"
export const CRYPTO_USDC_ID = "pp_crypto-usdc_crypto-usdc"

export type FeeModel = {
  label: string
  /**
   * Eligible to be the auto-recommended default. USDC is the frictionless
   * managed-wallet rail (buyer never handles a wallet/seed phrase), so it is
   * now the primary recommended default. Fiat rails remain available.
   */
  autoRecommend: boolean
  /** compute the provider fee in minor units for a given amount (minor units) */
  fee: (amountMinor: number) => number
}

const NAIRA = 100 // 1 NGN in kobo

// Fee models keyed by the registered provider id. Only providers present here
// participate in fee routing (e.g. pp_system_default is intentionally excluded).
export const FEE_TABLE: Record<string, FeeModel> = {
  [PAYSTACK_ID]: {
    label: "Paystack",
    autoRecommend: true,
    fee: (amount) => {
      const pct = amount * 0.015
      const flat = amount < 2500 * NAIRA ? 0 : 100 * NAIRA // ₦100 waived under ₦2,500
      return Math.min(Math.round(pct + flat), 2000 * NAIRA) // cap ₦2,000
    },
  },
  [FLUTTERWAVE_ID]: {
    label: "Flutterwave",
    autoRecommend: true,
    fee: (amount) => Math.min(Math.round(amount * 0.014), 2000 * NAIRA), // cap ₦2,000
  },
  [CRYPTO_USDC_ID]: {
    label: "Pay with USDC",
    autoRecommend: true, // frictionless managed-wallet rail — primary default
    fee: () => 0, // no platform fee; gas is abstracted by the settlement layer
  },
}

export type ProviderOption = {
  provider_id: string
  label: string
  fee: number
  total: number
  recommended: boolean
}

/**
 * Rank the fee-eligible, enabled providers ascending by effective fee. The
 * cheapest auto-recommend-eligible rail is flagged `recommended` (the
 * storefront preselects it). USDC (managed-wallet, frictionless) is the primary
 * recommended default since it is fee-eligible and zero-fee; fiat rails are
 * also eligible. Ties break deterministically by provider id.
 */
export function rankProviders(
  amountMinor: number,
  enabledIds: string[]
): ProviderOption[] {
  const options = enabledIds
    .filter((id) => id in FEE_TABLE)
    .map((id) => {
      const fee = FEE_TABLE[id].fee(amountMinor)
      return {
        provider_id: id,
        label: FEE_TABLE[id].label,
        fee,
        total: amountMinor + fee,
        recommended: false,
      }
    })
    .sort((a, b) => a.fee - b.fee || a.provider_id.localeCompare(b.provider_id))

  // Recommend the cheapest auto-recommend-eligible option; since the list is
  // fee-sorted, the first eligible one is the cheapest recommended rail.
  const recommended = options.find(
    (o) => FEE_TABLE[o.provider_id]?.autoRecommend
  )
  if (recommended) {
    recommended.recommended = true
  }

  return options
}
