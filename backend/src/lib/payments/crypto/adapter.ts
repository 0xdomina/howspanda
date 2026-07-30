/**
 * Network-agnostic crypto settlement seam.
 *
 * Adding a new network (bsc, somnia, arc) or flipping testnet↔mainnet is
 * additive: implement `CryptoSettlement`, wire it into the factory, extend the
 * blockchain map. No route or payment-provider changes required.
 */

export type CryptoNetwork = "base" | "solana" // extensible: bsc, somnia, arc
export type NetworkEnv = "testnet" | "mainnet"

export interface DepositIntent {
  network: CryptoNetwork
  env: NetworkEnv
  address: string
  usdc_amount: string
  reference: string
  wallet_id: string
  expires_at: string
}

export interface SettlementStatus {
  reference: string
  status: "pending" | "confirmed" | "failed"
  tx_hash?: string
  usdc_received?: string
}

// Inbound-settlement lookup. wallet_id scopes the check to the intent's own
// deposit wallet; expected_usdc guards against under-payments. Both optional
// so the mock (and older sessions) keep working.
export interface SettlementQuery {
  reference: string
  wallet_id?: string
  expected_usdc?: string
}

// Outbound USDC transfer (seller payout) — mirrors SettlementStatus.
export interface WithdrawalStatus {
  reference: string
  status: "pending" | "confirmed" | "failed"
  tx_hash?: string
}

export interface CryptoSettlement {
  readonly network: CryptoNetwork
  readonly env: NetworkEnv
  createDepositIntent(input: {
    reference: string
    usdc_amount: string
  }): Promise<DepositIntent>
  checkSettlement(query: SettlementQuery): Promise<SettlementStatus>
  createWithdrawal(input: {
    reference: string
    address: string
    usdc_amount: string
  }): Promise<WithdrawalStatus>
  checkWithdrawal(reference: string): Promise<WithdrawalStatus>
}

export class CryptoUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CryptoUnavailableError"
  }
}

// Circle blockchain identifiers per network + env (used by the live adapter).
export const CIRCLE_BLOCKCHAIN: Record<
  CryptoNetwork,
  Record<NetworkEnv, string>
> = {
  base: { testnet: "BASE-SEPOLIA", mainnet: "BASE" },
  solana: { testnet: "SOL-DEVNET", mainnet: "SOL" },
}
