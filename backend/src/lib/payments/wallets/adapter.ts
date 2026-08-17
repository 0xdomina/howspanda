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
  // Provider-side transaction identifier used for polling before a chain hash
  // exists (notably Circle SCA transactions).
  provider_id?: string
}

export interface UserWalletSigner {
  readonly network: CryptoNetwork
  readonly env: NetworkEnv
  /**
   * Derive (or re-derive) the user's wallet address from a unique derivation
   * index. Indices are allocated from a DB counter (never a hash), so no two
   * actors can ever collide on the same address.
   */
  deriveWallet(derivationIndex: number): Promise<UserWallet>
  /** Current USDC spendable balance at the address (6-decimals, string). */
  balanceOf(address: string): Promise<string>
  /**
   * Transfer USDC from a user wallet (derived) to a destination. Amount is in
   * USDC 6-decimals.
   */
  spend(input: {
    derivationIndex: number
    to: string
    usdc_amount: string
    reference: string
  }): Promise<WalletSpendResult>
  /** Resolve the on-chain status of a previously signed spend. */
  checkSpend(input: {
    reference: string
    tx_hash?: string | null
    provider_id?: string | null
  }): Promise<WalletSpendResult>
}

export class WalletUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WalletUnavailableError"
  }
}
