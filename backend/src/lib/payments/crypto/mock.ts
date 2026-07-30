import {
  CryptoNetwork,
  CryptoSettlement,
  DepositIntent,
  NetworkEnv,
  SettlementQuery,
  SettlementStatus,
  WithdrawalStatus,
} from "./adapter"

// Module-level state survives factory recreation. The provider builds a fresh
// settlement per request, so the pending→confirmed progression has to live
// here (keyed by reference), not on the instance.
type MockEntry = { checks: number; usdc_amount: string }
const MOCK_STATE = new Map<string, MockEntry>()

type MockWithdrawal = { checks: number; address: string }
const MOCK_WITHDRAWALS = new Map<string, MockWithdrawal>()

/**
 * Deterministic offline settlement — no network, no keys (mirrors the AI mock
 * provider). The first `checkSettlement({ reference })` returns `pending`;
 * every
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
      // per-intent address — mirrors the live per-intent wallet correlation fix
      address: `mock-${this.network}-${input.reference}`,
      usdc_amount: input.usdc_amount,
      reference: input.reference,
      wallet_id: `mock-wallet-${input.reference}`,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
  }

  async checkSettlement(query: SettlementQuery): Promise<SettlementStatus> {
    const { reference } = query
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

  async createWithdrawal(input: {
    reference: string
    address: string
    usdc_amount: string
  }): Promise<WithdrawalStatus> {
    if (!MOCK_WITHDRAWALS.has(input.reference)) {
      MOCK_WITHDRAWALS.set(input.reference, {
        checks: 0,
        address: input.address,
      })
    }
    return { reference: input.reference, status: "pending" }
  }

  async checkWithdrawal(reference: string): Promise<WithdrawalStatus> {
    const entry = MOCK_WITHDRAWALS.get(reference) ?? {
      checks: 0,
      address: "",
    }
    entry.checks += 1
    MOCK_WITHDRAWALS.set(reference, entry)

    if (entry.address.includes("fail")) {
      return { reference, status: "failed" }
    }
    if (entry.checks < 2) {
      return { reference, status: "pending" }
    }
    return {
      reference,
      status: "confirmed",
      tx_hash: `0xmockout${reference}`,
    }
  }
}
