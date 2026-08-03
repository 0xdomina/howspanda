"use server"

import { sdk } from "@lib/config"

export type WalletLedger = {
  id: string
  amount: number | string
  source: string
  reference?: string | null
  created_at?: string
}

export type WithdrawalAccount = {
  id: string
  type: "bank_account" | "crypto_address"
  currency_code?: string
  bank_code?: string | null
  account_number?: string | null
  account_name?: string | null
  recipient_code?: string | null
  network?: string | null
  address?: string | null
  is_default?: boolean
  status?: string
}

export type BuyerWithdrawal = {
  id: string
  currency_code?: string
  amount: number | string
  rail: string
  status: string
  destination?: any
  failure_reason?: string | null
  created_at?: string
}

export type WalletSummary = {
  balance: number
  minimum_ngn: number
  ledger: WalletLedger[]
}

// The store wallet routes are keyed by the guest-checkout email — the same
// identity the wallet uses. Ownership is proven by passing it as a query param.
export const getBuyerWallet = async (
  email: string
): Promise<WalletSummary | null> => {
  try {
    const res = await sdk.client.fetch<{
      balance: number
      minimum_ngn: number
      ledger: WalletLedger[]
    }>("/store/wallet", {
      method: "GET",
      query: { email },
      cache: "no-store",
    })
    return { balance: res.balance ?? 0, minimum_ngn: res.minimum_ngn ?? 0, ledger: res.ledger ?? [] }
  } catch {
    return null
  }
}

export const listWithdrawalAccounts = async (
  email: string
): Promise<WithdrawalAccount[]> => {
  try {
    return await sdk.client
      .fetch<{ withdrawal_accounts: WithdrawalAccount[] }>(
        "/store/wallet/withdrawal-accounts",
        { method: "GET", query: { email }, cache: "no-store" }
      )
      .then(({ withdrawal_accounts }) => withdrawal_accounts ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const addWithdrawalAccount = async (
  email: string,
  body: {
    type: "bank_account"
    bank_code: string
    account_number: string
  } | {
    type: "crypto_address"
    network: "base" | "solana"
    address: string
  }
): Promise<{ success: boolean; error: string | null }> => {
  try {
    await sdk.client.fetch("/store/wallet/withdrawal-accounts", {
      method: "POST",
      body: { buyerEmail: email, ...body },
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error.toString() }
  }
}

export const listWithdrawals = async (
  email: string
): Promise<BuyerWithdrawal[]> => {
  try {
    return await sdk.client
      .fetch<{ withdrawals: BuyerWithdrawal[] }>("/store/wallet/withdrawals", {
        method: "GET",
        query: { email },
        cache: "no-store",
      })
      .then(({ withdrawals }) => withdrawals ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const createWithdrawal = async (
  email: string,
  rail: "paystack" | "crypto-usdc",
  amount: number
): Promise<{ success: boolean; error: string | null }> => {
  try {
    await sdk.client.fetch("/store/wallet/withdrawals", {
      method: "POST",
      body: { buyerEmail: email, rail, amount },
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error.toString() }
  }
}