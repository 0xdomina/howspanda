import {
  CryptoNetwork,
  CryptoSettlement,
  CryptoUnavailableError,
  NetworkEnv,
} from "./adapter"
import { MockCryptoSettlement } from "./mock"
import { CircleCryptoSettlement } from "./circle"
import { ArcCryptoSettlement, isArcConfigured } from "./arc"

const VALID_NETWORKS: CryptoNetwork[] = ["base", "solana", "arc"]

export function isCryptoEnabled(): boolean {
  return process.env.CRYPTO_ENABLED === "true"
}

export { isArcConfigured } from "./arc"

export function getNetworkEnv(): NetworkEnv {
  return process.env.CRYPTO_NETWORK_ENV === "mainnet" ? "mainnet" : "testnet"
}

// Fixed configurable NGN→USDC rate for the PoC — deterministic, documented as
// a placeholder for a real price oracle in a later phase.
export function ngnPerUsdc(): number {
  const v = Number(process.env.CRYPTO_NGN_PER_USDC)
  return Number.isFinite(v) && v > 0 ? v : 1600
}

export function quoteUsdc(ngnAmount: number): string {
  return (ngnAmount / ngnPerUsdc()).toFixed(2)
}

/**
 * Factory: env → settlement implementation + network. Returns the mock adapter
 * when no real provider is configured (default), else the live Arc (for the
 * "arc" network) or Circle adapter. Throws on an unknown network — mirrors the
 * AI `getModel` unknown-provider guard so a typo can never silently pick a
 * wrong chain.
 */
export function getCryptoSettlement(network?: string): CryptoSettlement {
  const chosen = (network ||
    process.env.CRYPTO_DEFAULT_NETWORK ||
    "base") as CryptoNetwork

  if (!VALID_NETWORKS.includes(chosen)) {
    throw new CryptoUnavailableError(`Unknown crypto network "${chosen}"`)
  }

  const env = getNetworkEnv()

  // Arc is the USDC-native L1: configured directly via a dev-controlled wallet
  // (ARC_MNEMONIC / ARC_PRIVATE_KEY), no Circle merchant API key required.
  if (chosen === "arc") {
    if (isArcConfigured()) {
      return new ArcCryptoSettlement()
    }
    return new MockCryptoSettlement(chosen, env)
  }

  const apiKey = process.env.CIRCLE_API_KEY

  if (!apiKey || apiKey === "mock") {
    return new MockCryptoSettlement(chosen, env)
  }

  return new CircleCryptoSettlement(chosen, env, {
    apiKey,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
    walletSetId: process.env.CIRCLE_WALLET_SET_ID,
  })
}
