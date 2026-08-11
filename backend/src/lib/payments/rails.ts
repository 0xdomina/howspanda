import { isArcConfigured } from "./crypto/arc"

/**
 * Payment rail registry — the single source of truth for which money rails
 * exist, what mode each is in (mock | test | live), and what its default
 * on/off state is.
 *
 * Two independent knobs:
 *   - MODE  is derived from the provider keys in env (mock when the key is
 *           absent/"mock", test/live from the key's own prefix or network env).
 *           Switching a rail between mock/test/live is a key change + restart.
 *   - ENABLED has an env default (`*_ENABLED`, used to seed the persistent
 *           `payment_rail` rows) and is then runtime-toggleable through the
 *           admin API + storefront (see modules/payment-rails). `system_default`
 *           is always on.
 */

export type RailKey = "paystack" | "flutterwave" | "crypto-usdc" | "system_default"
export type RailKind = "fiat-card" | "crypto" | "manual"
export type RailMode = "mock" | "test" | "live"

export type RailMeta = {
  key: RailKey
  providerId: string
  label: string
  kind: RailKind
}

export const RAILS: RailMeta[] = [
  {
    key: "paystack",
    providerId: "pp_paystack_paystack",
    label: "Paystack",
    kind: "fiat-card",
  },
  {
    key: "flutterwave",
    providerId: "pp_flutterwave_flutterwave",
    label: "Flutterwave",
    kind: "fiat-card",
  },
  {
    key: "crypto-usdc",
    providerId: "pp_crypto-usdc_crypto-usdc",
    label: "Pay with USDC",
    kind: "crypto",
  },
  {
    // The manual payment provider, surfaced as the direct-to-seller bank
    // transfer rail. The buyer pays the seller's verified bank account
    // directly (no platform custody) and uploads proof; the seller confirms
    // or rejects with a note. Always on, but only offered for carts that
    // qualify (see bank-transfer-gate).
    key: "system_default",
    providerId: "pp_system_default",
    label: "Pay by Bank Transfer",
    kind: "manual",
  },
]

const RAIL_BY_KEY = new Map<string, RailMeta>(RAILS.map((r) => [r.key, r]))

export function isRailKey(value: string): value is RailKey {
  return RAIL_BY_KEY.has(value)
}

export function railMeta(key: string): RailMeta | undefined {
  return RAIL_BY_KEY.get(key)
}

/**
 * Env-driven default for whether a rail starts enabled. `system_default` is
 * always on. These defaults seed the persistent `payment_rail` rows on first
 * boot; after that the admin/storefront runtime toggle is the source of truth.
 */
export function defaultRailEnabled(key: RailKey): boolean {
  switch (key) {
    case "paystack":
      return process.env.PAYSTACK_ENABLED !== "false"
    case "flutterwave":
      return process.env.FLUTTERWAVE_ENABLED !== "false"
    case "crypto-usdc":
      return process.env.CRYPTO_ENABLED === "true"
    case "system_default":
      return true
  }
}

function modeFromKey(
  key: string | undefined,
  testPrefix: string,
  livePrefix: string
): RailMode {
  if (!key || key === "mock") {
    return "mock"
  }
  if (key.startsWith(livePrefix)) {
    return "live"
  }
  if (key.startsWith(testPrefix)) {
    return "test"
  }
  return "test"
}

/**
 * Current mode of a rail, derived from env keys:
 *   - paystack:     sk_test_* → test (sandbox), sk_live_* → live
 *   - flutterwave:  FLWSECK_TEST-* → test, otherwise live
 *   - crypto-usdc:  mock unless a real Circle key OR an Arc dev wallet is
 *                   configured; the testnet↔mainnet switch comes from
 *                   CRYPTO_NETWORK_ENV (Arc is testnet-only today)
 */
export function railMode(key: RailKey): RailMode {
  switch (key) {
    case "paystack":
      return modeFromKey(
        process.env.PAYSTACK_SECRET_KEY,
        "sk_test_",
        "sk_live_"
      )
    case "flutterwave":
      return modeFromKey(
        process.env.FLUTTERWAVE_SECRET_KEY,
        "FLWSECK_TEST",
        "FLWSECK-"
      )
    case "crypto-usdc": {
      const circleKey = process.env.CIRCLE_API_KEY
      const hasRealProvider = !!(circleKey && circleKey !== "mock") || isArcConfigured()
      if (!hasRealProvider) {
        return "mock"
      }
      return process.env.CRYPTO_NETWORK_ENV === "mainnet" ? "live" : "test"
    }
    case "system_default":
      return "mock"
  }
}
