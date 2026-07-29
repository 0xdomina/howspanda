import {
  CryptoNetwork,
  CryptoSettlement,
  DepositIntent,
  NetworkEnv,
  SettlementStatus,
} from "./adapter"

// Module-level state survives factory recreation. The provider builds a fresh
// settlement per request, so the pending→confirmed progression has to live
// here (keyed by reference), not on the instance.
type MockEntry = { checks: number; usdc_amount: string }
const MOCK_STATE = new Map<string, MockEntry>()

/**
 * Deterministic offline settlement — no network, no keys (mirrors the AI mock
 * provider). The first `checkSettlement(reference)` returns `pending`; every
 * subsequent call returns `confirmed`, so tests can prove the
 * pending→authorized transition without a real chain.
 */
export class MockCryptoSettlement implements CryptoSettlement {
  readonly network: CryptoNetwork
  readonly env: NetworkEnv

  constructor(network: CryptoNetwork, env: NetworkEnv) {
    this.network = network
    this.env = env
  }

  async createDepositIntent(input: {
    reference: string
    usdc_amount: string
  }): Promise<DepositIntent> {
    MOCK_STATE.set(input.reference, {
      checks: 0,
      usdc_amount: input.usdc_amount,
    })
    return {
      network: this.network,
      env: this.env,
      address: `mock-${this.network}-${input.reference}`,
      usdc_amount: input.usdc_amount,
      reference: input.reference,
      wallet_id: `mock-wallet-${this.network}`,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
  }

  async checkSettlement(reference: string): Promise<SettlementStatus> {
    const entry = MOCK_STATE.get(reference) ?? { checks: 0, usdc_amount: "0" }
    entry.checks += 1
    MOCK_STATE.set(reference, entry)

    if (entry.checks < 2) {
      return { reference, status: "pending" }
    }

    return {
      reference,
      status: "confirmed",
      tx_hash: `0xmock${reference}`,
      usdc_received: entry.usdc_amount,
    }
  }
}
