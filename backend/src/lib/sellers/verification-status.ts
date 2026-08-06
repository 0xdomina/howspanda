import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import { KYC_MODULE } from "../../modules/kyc"
import KycModuleService from "../../modules/kyc/service"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import type MarketplaceModuleService from "../../modules/marketplace/service"

export type SellerVerificationStatus = "unverified" | "pending" | "verified"

// The KYC identity ladder is the single source of truth for the store's
// verification mark. Only an identity review (NIN) counts as verified —
// phone/email alone never grants the store "Verified" badge.
export function verificationStatusFromKyc(
  idStatus: string | null
): SellerVerificationStatus {
  if (idStatus === "verified") return "verified"
  if (idStatus === "pending") return "pending"
  return "unverified"
}

/**
 * Derive a seller's verification status from its KYC identity state. The
 * seller_admin signup identifier (email/phone) keys the KYC profile, so the
 * status always reflects what was actually verified — never a stale column.
 */
export async function resolveSellerVerificationStatus(
  container: MedusaContainer,
  sellerId: string
): Promise<SellerVerificationStatus> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: admins } = await query.graph({
    entity: "seller_admin",
    fields: ["email", "phone"],
    filters: { seller_id: sellerId },
  })
  const admin = admins?.[0]
  if (!admin) return "unverified"

  const kyc = container.resolve<KycModuleService>(KYC_MODULE)
  const profile = await kyc.getProfileView({
    email: admin.email,
    phone: admin.phone,
  })
  return verificationStatusFromKyc(profile?.id_status ?? null)
}

/**
 * Persist a verification status onto every seller owned by admins matching
 * the contact. Called at KYC identity transitions so any direct reader of the
 * seller column stays truthful too.
 */
export async function syncSellerVerificationStatus(
  container: MedusaContainer,
  contact: { email?: string | null; phone?: string | null },
  status: SellerVerificationStatus
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const marketplace = container.resolve<MarketplaceModuleService>(
    MARKETPLACE_MODULE
  )

  const adminIds = new Set<string>()
  if (contact.email) {
    const { data: byEmail } = await query.graph({
      entity: "seller_admin",
      fields: ["seller.id"],
      filters: { email: contact.email.trim().toLowerCase() },
    })
    for (const a of byEmail ?? []) if (a?.seller?.id) adminIds.add(a.seller.id)
  }
  if (contact.phone) {
    const { data: byPhone } = await query.graph({
      entity: "seller_admin",
      fields: ["seller.id"],
      filters: { phone: contact.phone.trim() },
    })
    for (const a of byPhone ?? []) if (a?.seller?.id) adminIds.add(a.seller.id)
  }

  if (adminIds.size === 0) return
  await marketplace.updateSellers(
    [...adminIds].map((id) => ({ id, verification_status: status }))
  )
}
