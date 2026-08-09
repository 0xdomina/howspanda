"use server"

import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"
import { getSellerAuthHeaders, getSellerCacheTag } from "./seller-cookies"
import { getAuthHeaders } from "./cookies"

export type DeliveryJob = {
  id: string
  order_id?: string | null
  seller_id?: string | null
  package_description: string
  package_weight?: string | null
  pickup_address: string
  destination_address: string
  destination_phone?: string | null
  pickup_lat?: number | null
  pickup_lng?: number | null
  destination_lat?: number | null
  destination_lng?: number | null
  pickup_distance_km?: number | null
  destination_distance_km?: number | null
  posted_price: number | string
  status: string
  accepted_offer_id?: string | null
  picked_up_at?: string | null
  delivered_at?: string | null
  cancelled_at?: string | null
  cancel_reason?: string | null
  cancel_requires_sender_approval?: boolean
  courier_phone?: string | null
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

export type CourierProfile = {
  id: string
  courier_email: string
  auth_identity_id?: string | null
  actor_type?: "customer" | "seller" | null
  name?: string | null
  phone?: string | null
  city?: string | null
  vehicle?: string | null
  status: "applied" | "approved" | "suspended"
  approved_at?: string | null
}

export type CourierMe = {
  courier: CourierProfile | null
  kyc: {
    level: string
    phone_verified: boolean
    email_verified: boolean
    [key: string]: unknown
  } | null
  jobs: {
    offer_id: string
    offered_price: number | string
    offer_status: string
    created_at: string
    job: Omit<DeliveryJob, "destination_phone"> | null
  }[]
  earnings: number
}

type AuthHeaders = { authorization: string } | {}
const hasAuth = (headers: AuthHeaders): headers is { authorization: string } =>
  "authorization" in headers

// --- public / courier side (publishable key) ---

export type GeocodeResult = {
  lat: number
  lng: number
  displayName: string
  city?: string | null
  country?: string | null
  postcode?: string | null
}

/** Forward geocode an address via Nominatim (public route). */
export const geocodeAddress = async (
  address: string
): Promise<GeocodeResult | null> => {
  try {
    return await sdk.client
      .fetch<{ result: GeocodeResult }>("/store/geo/geocode", {
        method: "GET",
        query: { address },
        cache: "no-store",
      })
      .then(({ result }) => result)
      .catch(() => null)
  } catch {
    return null
  }
}

/** Reverse geocode coordinates into an address via Nominatim (public route). */
export const reverseGeocode = async (
  lat: number,
  lng: number
): Promise<GeocodeResult | null> => {
  try {
    return await sdk.client
      .fetch<{ result: GeocodeResult }>("/store/geo/reverse", {
        method: "GET",
        query: { lat, lng },
        cache: "no-store",
      })
      .then(({ result }) => result)
      .catch(() => null)
  } catch {
    return null
  }
}

export const listOpenDeliveryJobs = async (params?: {
  city?: string
  lat?: number
  lng?: number
  radiusKm?: number
}): Promise<DeliveryJob[]> => {
  try {
    return await sdk.client
      .fetch<{ jobs: DeliveryJob[] }>("/store/delivery-jobs", {
        method: "GET",
        query: params,
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
    const headers = await getAuthHeaders()
    return await sdk.client
      .fetch<{ job: DeliveryJob }>(`/store/delivery-jobs/${id}`, {
        method: "GET",
        headers,
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
  offeredPrice: number
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getAuthHeaders()
    if (!hasAuth(headers)) {
      return { success: false, error: "Sign in with your account to make a delivery offer." }
    }
    await sdk.client.fetch(`/store/delivery-jobs/${jobId}/offers`, {
      method: "POST",
      headers,
      body: { offeredPrice },
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

export const markPickedUp = async (
  jobId: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getAuthHeaders()
    if (!hasAuth(headers)) {
      return { success: false, error: "Sign in with your account to mark pickup." }
    }
    await sdk.client.fetch(`/store/delivery-jobs/${jobId}/pickup`, {
      method: "POST",
      headers,
      body: {},
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

// --- courier role (authenticated customer/seller account) ---

export const applyCourier = async (input: {
  name?: string
  phone?: string
  city?: string
  vehicle?: string
}): Promise<{ success: boolean; error: string | null; code?: string }> => {
  try {
    const headers = await getAuthHeaders()
    if (!hasAuth(headers)) {
      return { success: false, error: "Sign in with your account to apply." }
    }
    await sdk.client.fetch("/store/couriers/apply", {
      method: "POST",
      headers,
      body: input,
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString(), code: error?.code }
  }
}

export const getCourierMe = async (): Promise<CourierMe | null> => {
  try {
    const headers = await getAuthHeaders()
    if (!hasAuth(headers)) return null
    return await sdk.client
      .fetch<CourierMe>("/store/couriers/me", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .catch(() => null)
  } catch {
    return null
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
  _email?: string
): Promise<any[]> => {
  try {
    const headers = await getAuthHeaders()
    if (!hasAuth(headers)) return []
    return await sdk.client
      .fetch<{ messages: any[] }>(`/store/delivery-jobs/${jobId}/chat`, {
        method: "GET",
        headers,
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
  _senderEmail: string,
  body: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getAuthHeaders()
    if (!hasAuth(headers)) {
      return { success: false, error: "Sign in to send a message." }
    }
    await sdk.client.fetch(`/store/delivery-jobs/${jobId}/chat`, {
      method: "POST",
      headers,
      body: { body },
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
    revalidateTag(tag, "max")

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
    revalidateTag(tag, "max")

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}
