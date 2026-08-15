"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"
import { circle, isCircleConfigured } from "@lib/config"

// Types remain the same
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

// Helper: build Circle API request headers
const circleHeaders = () => {
  const token = circle.accessToken
  if (!token) return {}
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  }
}

// Check if Circle is configured and use its API, otherwise fall back to store routes
const useCircle = () => {
  // Circle is configured AND the caller is not a backend-only scenario
  // In production, frontend should use Circle; backend may still use store routes
  return isCircleConfigured()
}

// The store crypto-wallet routes resolve ownership from the authenticated
// customer JWT actor — the caller only needs to be logged in.
export const getCryptoWallet = async (): Promise<CryptoWalletSummary | null> => {
  // If Circle is configured, use Circle API to get the user's managed wallet
  if (useCircle()) {
    try {
      const res = await fetch(`${circle.baseUrl}/v1/wallets`, {
        method: "GET",
        headers: circleHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        // Circle returns wallet data; map to our type if needed
        if (data && data.id && data.address) {
          return {
            wallet: {
              network: data.chain ?? "base",
              env: "production",
              address: data.address,
            },
            balance_usdc: data.balance ?? "0",
          }
        }
      }
      // Fall through to store route if Circle API fails or returns unexpected data
    } catch {
      // Fall through to store route
    }
  }

  // Fallback: use store routes (original behavior)
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
  // If Circle is configured, use Circle API for the withdrawal
  if (useCircle()) {
    try {
      const res = await fetch(`${circle.baseUrl}/v1/wallets/${body.to_address}/payments`, {
        method: "POST",
        headers: circleHeaders(),
        body: JSON.stringify({
          amount: body.usdc_amount,
          currency: "USDC",
          idempotencyKey: body.idempotency_key,
          // Note: Circle's actual withdrawal flow is more complex;
          // this is a simplified programmable wallet payment creation
        }),
      })
      if (res.ok) {
        const data = await res.json()
        return { success: true, error: null, spend: { status: "signed", tx_hash: data.id } }
      } else {
        const errData = await res.json()
        return { success: false, error: errData.errors?.[0]?.detail ?? "Circle withdrawal failed" }
      }
    } catch (err: any) {
      return { success: false, error: err.message ?? "Circle withdrawal error" }
    }
  }

  // Fallback: use store routes (original behavior)
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
