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
  job: Record<string, any>
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
  return {
    ...job,
    offers: offers.map((o: any) => ({
      ...o,
      courier_name: names[norm(o.courier_email)] ?? null,
    })),
    parties: parties.map((p: any) => ({
      ...p,
      name: names[norm(p.email)] ?? null,
    })),
    messages: messages.map((m: any) => ({
      ...m,
      sender_name: names[norm(m.sender_email)] ?? null,
    })),
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
