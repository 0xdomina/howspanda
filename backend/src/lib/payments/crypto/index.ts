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

/**
 * Explicit mock-mode override: when CRYPTO_WALLET_SIGNER=mock both the wallet
 * signer and settlement rails resolve to the offline mock even if a real
 * provider (ARC_MNEMONIC / CIRCLE_API_KEY) is configured. Defaults to off so
 * a configured provider always wins.
 */
export function isMockSignerForced(): boolean {
  return process.env.CRYPTO_WALLET_SIGNER === "mock"
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

/**
 * Quote an amount in USDC. The input is the currency's MAJOR unit (naira),
 * matching the buyer-wallet ledger convention; callers dealing in minor units
 * (kobo) must divide by 100 first. Returns a 2-dp string for the adapters.
 */
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

  if (isMockSignerForced()) {
    return new MockCryptoSettlement(chosen, env)
  }

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

  const entitySecret = process.env.CIRCLE_ENTITY_SECRET
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID
  if (!entitySecret || !walletSetId) {
    throw new CryptoUnavailableError(
      "Circle is enabled with a real API key but CIRCLE_ENTITY_SECRET or CIRCLE_WALLET_SET_ID is missing"
    )
  }
  if (!/^[a-fA-F0-9]{64}$/.test(entitySecret)) {
    throw new CryptoUnavailableError(
      "CIRCLE_ENTITY_SECRET must be the registered 32-byte hexadecimal entity secret"
    )
  }

  return new CircleCryptoSettlement(chosen, env, {
    apiKey,
    entitySecret,
    walletSetId,
    accountType: process.env.CIRCLE_ACCOUNT_TYPE === "EOA" ? "EOA" : "SCA",
    baseUrl: process.env.CIRCLE_API_BASE_URL,
  })
}
