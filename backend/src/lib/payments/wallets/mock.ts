import {
  UserWallet,
  UserWalletSigner,
  WalletSpendResult,
} from "./adapter"
import { CryptoNetwork } from "../crypto/adapter"

// Module-level balances survive factory recreation (the provider/service builds
// a fresh signer per request, like the settlement mock).
const MOCK_BALANCES = new Map<string, string>()
const MOCK_SPENDS = new Map<string, WalletSpendResult>()

/** Seed (or top up) a mock wallet balance — test/fixture helper. */
export function mockFundWallet(address: string, usdc: string) {
  MOCK_BALANCES.set(address, usdc)
}

export function mockWalletBalance(address: string): string {
  return MOCK_BALANCES.get(address) ?? "0"
}

/** Force a mock spend to confirm — test/fixture helper. */
export function mockConfirmSpend(reference: string) {
  MOCK_SPENDS.set(reference, { status: "confirmed", tx_hash: `0xmockwallet${reference}` })
}

/**
 * Deterministic offline user-wallet signer — no network, no keys. Balances are
 * seeded via `mockFundWallet`; spends debited against them. Mirrors the
 * settlement mock so tests can prove signup→wallet→fund→spend without a chain.
 */
export class MockUserWalletSigner implements UserWalletSigner {
  readonly network: CryptoNetwork
  readonly env: "testnet" | "mainnet"

  constructor(network: CryptoNetwork, env: "testnet" | "mainnet") {
    this.network = network
    this.env = env
  }

  async deriveWallet(derivationIndex: number): Promise<UserWallet> {
    return {
      network: this.network,
      env: this.env,
      address: `mock-${this.network}-${derivationIndex.toString(36)}`,
      derivation_index: derivationIndex,
    }
  }

  async balanceOf(address: string): Promise<string> {
    return mockWalletBalance(address)
  }

  async spend(input: {
    derivationIndex: number
    to: string
    usdc_amount: string
    reference: string
  }): Promise<WalletSpendResult> {
    const { address } = await this.deriveWallet(input.derivationIndex)
    const current = Number(mockWalletBalance(address))
    const amount = Number(input.usdc_amount)
    if (current < amount) {
      return { status: "failed" }
    }
    MOCK_BALANCES.set(address, (current - amount).toFixed(2))
    MOCK_SPENDS.set(input.reference, {
      status: "pending",
      tx_hash: `0xmockwallet${input.reference}`,
    })
    return MOCK_SPENDS.get(input.reference)!
  }

  async checkSpend(input: {
    reference: string
    tx_hash?: string | null
    provider_id?: string | null
  }): Promise<WalletSpendResult> {
    return MOCK_SPENDS.get(input.reference) ?? { status: "pending" }
  }
}
