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

export interface CryptoSettlement {
  readonly network: CryptoNetwork
  readonly env: NetworkEnv
  createDepositIntent(input: {
    reference: string
    usdc_amount: string
  }): Promise<DepositIntent>
  checkSettlement(reference: string): Promise<SettlementStatus>
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
