"use server"

import { sdk } from "@lib/config"

export type EscrowLine = {
  id: string
  seller_id?: string
  seller?: { name?: string; handle?: string } | null
  status: string
  net_amount: number
  currency_code: string
  delivered_at?: string | null
  confirmed_at?: string | null
  held_at?: string | null
  hold_reason?: string | null
  release_due_at?: string | null
}

export type EscrowStatus = {
  order_id: string
  lines: EscrowLine[]
}

export type BuyerActionResult = {
  success: boolean
  error: string | null
}

const toError = (err: any): string => {
  try {
    return err?.message ?? err?.toString() ?? "Something went wrong."
  } catch {
    return "Something went wrong."
  }
}

export const retrieveOrderEscrow = async (
  orderId: string,
  email: string
): Promise<EscrowStatus | { success: false; error: string }> => {
  try {
    return await sdk.client
      .fetch<EscrowStatus>(
        `/store/orders/${orderId}/escrow-status?email=${encodeURIComponent(email)}`,
        { method: "GET", cache: "no-store" }
      )
      .catch((err) => {
        throw err
      })
  } catch (err: any) {
    return { success: false, error: toError(err) }
  }
}

export const confirmOrderReceipt = async (
  orderId: string,
  email: string
): Promise<BuyerActionResult> => {
  try {
    await sdk.client.fetch(`/store/orders/${orderId}/confirm-receipt`, {
      method: "POST",
      body: { email },
    })
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: toError(err) }
  }
}

export const requestOrderReturn = async (
  orderId: string,
  email: string,
  reason: string
): Promise<BuyerActionResult> => {
  try {
    await sdk.client.fetch(`/store/orders/${orderId}/request-return`, {
      method: "POST",
      body: { email, reason },
    })
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: toError(err) }
  }
}

export const cancelOrderReturn = async (
  orderId: string,
  email: string
): Promise<BuyerActionResult> => {
  try {
    await sdk.client.fetch(`/store/orders/${orderId}/cancel-return`, {
      method: "POST",
      body: { email },
    })
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: toError(err) }
  }
}

export const tipSeller = async (
  orderId: string,
  email: string,
  amount: number,
  note?: string
): Promise<BuyerActionResult> => {
  try {
    await sdk.client.fetch(`/store/orders/${orderId}/tip`, {
      method: "POST",
      body: { email, amount, note: note || undefined },
    })
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: toError(err) }
  }
}

export const createOrderReview = async (
  orderId: string,
  email: string,
  rating: number,
  comment?: string
): Promise<BuyerActionResult> => {
  try {
    await sdk.client.fetch(`/store/orders/${orderId}/review`, {
      method: "POST",
      body: {
        email,
        rating,
        comment: comment || undefined,
      },
    })
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: toError(err) }
  }
}
