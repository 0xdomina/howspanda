"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"
import { getSellerAuthHeaders } from "./seller-cookies"

export type ProductRequestStatus = "open" | "reviewing" | "available" | "not_available" | "closed"

export type ProductRequest = {
  id: string
  customer_id: string
  seller_id: string
  request: string
  status: ProductRequestStatus
  seller_note?: string | null
  product_id?: string | null
  responded_at?: string | null
  created_at?: string
}

export const createProductRequest = async (handle: string, request: string) => {
  try {
    const headers = await getAuthHeaders()
    const result = await sdk.client.fetch<{ request: ProductRequest; duplicate?: boolean }>(
      `/store/sellers/${encodeURIComponent(handle)}/requests`,
      { method: "POST", headers, body: { request: request.trim() } }
    )
    return { success: true, error: null, request: result.request, duplicate: result.duplicate }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString?.() ?? "Could not send request." }
  }
}

export const listBuyerProductRequests = async (): Promise<ProductRequest[]> => {
  try {
    const headers = await getAuthHeaders()
    return await sdk.client.fetch<{ requests: ProductRequest[] }>("/store/requests", {
      method: "GET", headers, cache: "no-store",
    }).then((r) => r.requests ?? [])
  } catch {
    return []
  }
}

export const listSellerProductRequests = async (): Promise<ProductRequest[]> => {
  try {
    const headers = await getSellerAuthHeaders()
    return await sdk.client.fetch<{ requests: ProductRequest[] }>("/sellers/requests", {
      method: "GET", headers, cache: "no-store",
    }).then((r) => r.requests ?? [])
  } catch {
    return []
  }
}

export const updateSellerProductRequest = async (
  id: string,
  body: { status: Exclude<ProductRequestStatus, "open">; seller_note?: string; product_id?: string }
) => {
  try {
    const headers = await getSellerAuthHeaders()
    const result = await sdk.client.fetch<{ request: ProductRequest }>(`/sellers/requests/${id}`, {
      method: "PATCH", headers, body,
    })
    return { success: true, error: null, request: result.request }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString?.() ?? "Could not update request." }
  }
}
