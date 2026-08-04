import { CryptoNetwork, NetworkEnv } from "../crypto/adapter"

/**
 * Network-agnostic per-user wallet signer seam.
 *
 * A user wallet is a deterministic address derived from the platform master
 * key — the platform holds the key, the user only ever sees their public
 * address (managed-wallet UX). The DB stores the public address + actor
 * binding; the private key is re-derived on demand and never persisted.
 *
 * Adding a network is additive: implement `UserWalletSigner`, wire it into the
 * factory. No route or module changes required.
 */

export interface UserWallet {
  network: CryptoNetwork
  env: NetworkEnv
  // Public address the user funds from their own wallet.
  address: string
  // Stable derivation handle (index) — re-derives the same key every time.
  derivation_index: number
}

export interface WalletSpendResult {
  status: "signed" | "pending" | "confirmed" | "failed"
  tx_hash?: string
}

export interface UserWalletSigner {
  readonly network: CryptoNetwork
  readonly env: NetworkEnv
  /** Derive (or re-derive) the user's wallet address from a stable key. */
  deriveWallet(key: string): Promise<UserWallet>
  /** Current USDC spendable balance at the address (6-decimals, string). */
  balanceOf(address: string): Promise<string>
  /**
   * Transfer USDC from a user wallet (derived) to a destination. `key` is the
   * same stable key passed to `deriveWallet`. Amount is in USDC 6-decimals.
   */
  spend(input: {
    key: string
    to: string
    usdc_amount: string
    reference: string
  }): Promise<WalletSpendResult>
  /** Resolve the on-chain status of a previously signed spend. */
  checkSpend(reference: string): Promise<WalletSpendResult>
}

export class WalletUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WalletUnavailableError"
  }
}
