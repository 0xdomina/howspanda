"use server"

import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"
import { getSellerAuthHeaders, getSellerCacheTag } from "./seller-cookies"

export type DeliveryJob = {
  id: string
  order_id?: string | null
  seller_id?: string | null
  package_description: string
  package_weight?: string | null
  pickup_address: string
  destination_address: string
  destination_phone?: string | null
  posted_price: number | string
  status: string
  accepted_offer_id?: string | null
  picked_up_at?: string | null
  delivered_at?: string | null
  cancelled_at?: string | null
  cancel_reason?: string | null
  cancel_requires_sender_approval?: boolean
  created_at: string
  updated_at: string
  offers?: any[]
  parties?: any[]
  messages?: any[]
  verifications?: any[]
}

export type DeliveryOffer = {
  id: string
  job_id?: string
  courier_email: string
  offered_price: number | string
  status: string
  created_at?: string
}

type AuthHeaders = { authorization: string } | {}
const hasAuth = (headers: AuthHeaders): headers is { authorization: string } =>
  "authorization" in headers

// --- public / courier side (publishable key) ---

export const listOpenDeliveryJobs = async (
  city?: string
): Promise<DeliveryJob[]> => {
  try {
    return await sdk.client
      .fetch<{ jobs: DeliveryJob[] }>("/store/delivery-jobs", {
        method: "GET",
        query: city ? { city } : undefined,
        cache: "no-store",
      })
      .then(({ jobs }) => jobs ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const retrieveDeliveryJob = async (
  id: string
): Promise<DeliveryJob | null> => {
  try {
    return await sdk.client
      .fetch<{ job: DeliveryJob }>(`/store/delivery-jobs/${id}`, {
        method: "GET",
        cache: "no-store",
      })
      .then(({ job }) => job)
      .catch(() => null)
  } catch {
    return null
  }
}

export const makeOffer = async (
  jobId: string,
  courierEmail: string,
  offeredPrice: number
): Promise<{ success: boolean; error: string | null }> => {
  try {
    await sdk.client.fetch(`/store/delivery-jobs/${jobId}/offers`, {
      method: "POST",
      body: { courierEmail, offeredPrice },
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

export const markPickedUp = async (
  jobId: string,
  courierEmail: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    await sdk.client.fetch(`/store/delivery-jobs/${jobId}/pickup`, {
      method: "POST",
      body: { courierEmail },
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

export const generateVerification = async (
  jobId: string,
  purpose: "pickup" | "delivery",
  courierEmail: string
): Promise<{ success: boolean; code?: string; codeTail?: string; error: string | null }> => {
  try {
    const result = await sdk.client.fetch<{ code?: string; code_tail?: string }>(
      `/store/delivery-jobs/${jobId}/verify/${purpose}`,
      { method: "POST", body: { courierEmail } }
    )
    return {
      success: true,
      code: result?.code,
      codeTail: result?.code_tail,
      error: null,
    }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

export const submitVerification = async (
  jobId: string,
  email: string,
  code: string,
  purpose: "pickup" | "delivery"
): Promise<{ success: boolean; error: string | null }> => {
  try {
    await sdk.client.fetch(`/store/delivery-jobs/${jobId}/verify`, {
      method: "POST",
      body: { email, code, purpose },
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

export const confirmDelivery = async (
  jobId: string,
  recipientEmail: string,
  courierEmail?: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    await sdk.client.fetch(`/store/delivery-jobs/${jobId}/confirm`, {
      method: "POST",
      body: { recipientEmail, courierEmail },
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

export const cancelDeliveryJob = async (
  jobId: string,
  email: string,
  reason: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    await sdk.client.fetch(`/store/delivery-jobs/${jobId}/cancel`, {
      method: "POST",
      body: { email, reason },
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

export const listDeliveryMessages = async (
  jobId: string,
  email?: string
): Promise<any[]> => {
  try {
    return await sdk.client
      .fetch<{ messages: any[] }>(`/store/delivery-jobs/${jobId}/chat`, {
        method: "GET",
        query: email ? { email } : undefined,
        cache: "no-store",
      })
      .then(({ messages }) => messages ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const sendDeliveryMessage = async (
  jobId: string,
  senderEmail: string,
  body: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    await sdk.client.fetch(`/store/delivery-jobs/${jobId}/chat`, {
      method: "POST",
      body: { senderEmail, body },
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

// --- seller side (bearer auth) ---

export const listSellerDeliveryJobs = async (): Promise<DeliveryJob[]> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return []

    return await sdk.client
      .fetch<{ jobs: DeliveryJob[] }>("/store/delivery-jobs/mine", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .then(({ jobs }) => jobs ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const postDeliveryJob = async (input: {
  orderId?: string
  packageDescription: string
  packageWeight?: string
  pickupAddress: string
  destinationAddress: string
  destinationPhone?: string
  postedPrice: number
}): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) {
      return { success: false, error: "Not signed in as a seller." }
    }

    await sdk.client.fetch("/store/delivery-jobs", {
      method: "POST",
      headers,
      body: input,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag)

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

export const acceptOffer = async (
  jobId: string,
  offerId: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) {
      return { success: false, error: "Not signed in as a seller." }
    }

    await sdk.client.fetch(`/store/delivery-jobs/${jobId}/offers/${offerId}/accept`, {
      method: "POST",
      headers,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag)

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}
