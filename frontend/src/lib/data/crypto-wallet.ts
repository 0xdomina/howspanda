"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"

export type ManagedCryptoWallet = {
  network: string
  env: string
  address: string
}

export type CryptoWalletSummary = {
  wallet: ManagedCryptoWallet
  balance_usdc: string
}

export type CryptoWalletSpend = {
  id: string
  status: "pending" | "signed" | "confirmed" | "failed"
  to_address?: string
  usdc_amount?: string
  tx_hash?: string | null
}

// The store crypto-wallet routes resolve ownership from the authenticated
// customer JWT actor — the caller only needs to be logged in.
export const getCryptoWallet = async (): Promise<CryptoWalletSummary | null> => {
  try {
    const headers = await getAuthHeaders()
    return await sdk.client.fetch<CryptoWalletSummary>("/store/crypto-wallet", {
      method: "GET",
      headers,
      cache: "no-store",
    })
  } catch {
    return null
  }
}

export const withdrawCryptoWallet = async (body: {
  to_address: string
  usdc_amount: string
  password: string
  idempotency_key: string
}): Promise<{ success: boolean; error: string | null; spend?: CryptoWalletSpend }> => {
  try {
    const headers = await getAuthHeaders()
    const res = await sdk.client.fetch<{ spend: CryptoWalletSpend }>(
      "/store/crypto-wallet/withdraw",
      { method: "POST", headers, body }
    )
    return { success: true, error: null, spend: res.spend }
  } catch (error: any) {
    return { success: false, error: error.message ?? error.toString() }
  }
}
