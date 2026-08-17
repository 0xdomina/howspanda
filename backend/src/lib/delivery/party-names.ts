import { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import DeliveryModuleService from "../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../modules/delivery"
import MarketplaceModuleService from "../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"

// Display-name resolution for delivery participants. The UI shows NAMES only —
// never any part of an email — so every offer, party, and message is annotated
// with a human name resolved from account profiles. Preference order for a
// courier: their own courier display name, then the customer/seller profile
// name (which signup now collects, so the profile name replaces any generic
// fallback).
const norm = (e: string) => e.trim().toLowerCase()

const joinName = (...parts: (string | null | undefined)[]): string | null => {
  const joined = parts
    .filter(Boolean)
    .map((p) => (p as string).trim())
    .filter(Boolean)
    .join(" ")
    .trim()
  return joined || null
}

export type PartyNameMap = Record<string, string>

export async function resolvePartyNames(
  req: MedusaRequest,
  emails: (string | null | undefined)[]
): Promise<PartyNameMap> {
  const unique = [...new Set(emails.filter(Boolean).map(norm))]
  if (!unique.length) return {}

  const map: PartyNameMap = {}

  // Courier display names come first — a courier who applied chose a name.
  const delivery = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const couriers = await delivery.listDeliveryCouriers(
    { courier_email: unique },
    { take: unique.length }
  )
  for (const c of couriers) {
    if (c.name) map[norm(c.courier_email)] = c.name
  }

  // Sellers (job posters / staff) have a real name on their seller_admin row.
  const marketplace = req.scope.resolve<MarketplaceModuleService>(
    MARKETPLACE_MODULE
  )
  const admins = await marketplace.listSellerAdmins(
    { email: unique },
    { take: unique.length }
  )
  for (const a of admins) {
    if (!a.email) continue
    const key = norm(a.email)
    if (!map[key]) {
      const name = joinName(a.first_name, a.last_name)
      if (name) map[key] = name
    }
  }

  // Recipients are buyers — their customer profile name is the display name.
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["email", "first_name", "last_name"],
    filters: { email: unique },
  })
  for (const c of customers ?? []) {
    if (!c.email) continue
    const key = norm(c.email as string)
    if (!map[key]) {
      const name = joinName(c.first_name, c.last_name)
      if (name) map[key] = name
    }
  }

  return map
}

/** Attach names to a job's offers, parties, and messages in place. */
export async function enrichJobWithPartyNames(
  req: MedusaRequest,
  job: Record<string, any>,
  viewerEmail?: string | null
): Promise<Record<string, any>> {
  const offers = Array.isArray(job.offers) ? job.offers : []
  const parties = Array.isArray(job.parties) ? job.parties : []
  const messages = Array.isArray(job.messages) ? job.messages : []
  const emails = [
    ...offers.map((o: any) => o.courier_email),
    ...parties.map((p: any) => p.email),
    ...messages.map((m: any) => m.sender_email),
  ]
  const names = await resolvePartyNames(req, emails)
  const delivery = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  let courierPhone: string | null = null
  const normalizedViewer = viewerEmail ? norm(viewerEmail) : null
  const accepted = ["accepted", "in_transit", "delivered"].includes(job.status)
  const isParty = normalizedViewer
    ? parties.some((party: any) => norm(party.email) === normalizedViewer)
    : false
  if (accepted && isParty) {
    const acceptedOffer = offers.find(
      (offer: any) =>
        offer.status === "accepted" || offer.id === job.accepted_offer_id
    )
    if (acceptedOffer?.courier_email) {
      const courier = await delivery.getCourierProfile(acceptedOffer.courier_email)
      courierPhone = courier?.phone ?? null
    }
  }
  const safeEmail = (value: unknown) =>
    normalizedViewer && typeof value === "string" && norm(value) === normalizedViewer
      ? value
      : undefined
  return {
    ...job,
    // A public job page can show the route and named participants, but never
    // becomes an email/phone directory. Contact numbers are only available to
    // an authenticated party after a courier is accepted.
    destination_phone: isParty ? job.destination_phone ?? null : null,
    offers: offers.map((o: any) => ({
      id: o.id,
      job_id: o.job_id,
      offered_price: o.offered_price,
      status: o.status,
      created_at: o.created_at,
      courier_name: names[norm(o.courier_email)] ?? null,
      is_mine: !!safeEmail(o.courier_email),
      courier_email: safeEmail(o.courier_email),
    })),
    parties: parties.map((p: any) => ({
      id: p.id,
      role: p.role,
      seller_id: p.seller_id,
      name: names[norm(p.email)] ?? null,
      is_me: !!safeEmail(p.email),
      email: safeEmail(p.email),
    })),
    messages: (isParty ? messages : []).map((m: any) => ({
      id: m.id,
      body: m.body,
      is_system: m.is_system,
      created_at: m.created_at,
      sender_name: names[norm(m.sender_email)] ?? null,
      sender_is_me: !!safeEmail(m.sender_email),
      sender_email: safeEmail(m.sender_email),
    })),
    // Verification rows contain hashes, expiry metadata, and generator
    // identities. They are server workflow state, never a public job field.
    verifications: [],
    courier_phone: courierPhone,
  }
}

/** Attach courier display names to offers (seller's my-jobs view). */
export async function enrichOffersWithCourierNames(
  req: MedusaRequest,
  jobs: Record<string, any>[]
): Promise<Record<string, any>[]> {
  const emails = jobs.flatMap((j) =>
    Array.isArray(j.offers) ? j.offers.map((o: any) => o.courier_email) : []
  )
  const names = await resolvePartyNames(req, emails)
  return jobs.map((job) => ({
    ...job,
    offers: Array.isArray(job.offers)
      ? job.offers.map((o: any) => ({
          ...o,
          courier_name: names[norm(o.courier_email)] ?? null,
        }))
      : job.offers,
  }))
}
