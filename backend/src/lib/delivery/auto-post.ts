import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import type MarketplaceModuleService from "../../modules/marketplace/service"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"

/**
 * Courier-mode auto-post, shared by the seller confirm route and the
 * Telegram one-click confirm. Payment confirmed + proof.delivery_mode ===
 * "courier" → job lands on the courier board (open to offers, price 0).
 * Idempotent (one job per order) and best-effort — returns the job or null.
 */
export async function maybeAutoPostCourierJob(
  container: MedusaContainer,
  input: { orderId: string; sellerId: string; buyerEmail: string }
): Promise<{ posted: boolean; jobId?: string }> {
  try {
    const marketplace =
      container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    const proof = await marketplace.bankTransferForOrder(
      input.orderId,
      input.sellerId
    )
    if (!proof || (proof as any).delivery_mode !== "courier") {
      return { posted: false }
    }
    const delivery =
      container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const existing = await delivery.listDeliveryJobs({
      order_id: input.orderId,
    } as any)
    if (existing.length) return { posted: false }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: [seller] } = (await query.graph({
      entity: "seller",
      fields: ["id", "pickup_address"],
      filters: { id: [input.sellerId] },
    })) as { data: any[] }
    const { data: [order] } = (await query.graph({
      entity: "order",
      fields: [
        "id",
        "shipping_address.address_1",
        "shipping_address.city",
        "shipping_address.phone",
        "items.title",
        "items.quantity",
      ],
      filters: { id: [input.orderId] },
    })) as { data: any[] }
    const pickup = (seller as any)?.pickup_address as string | undefined
    const ship = (order as any)?.shipping_address
    const destination = [ship?.address_1, ship?.city]
      .filter(Boolean)
      .join(", ")
    if (!pickup || !destination) return { posted: false }

    const titles = ((order as any)?.items ?? []).map(
      (i: any) =>
        `${Number(i.quantity) > 1 ? `${i.quantity}x ` : ""}${i.title ?? "item"}`
    )
    const job = await delivery.postJob({
      orderId: input.orderId,
      sellerId: input.sellerId,
      packageDescription: titles.length ? titles.join(", ") : "Order items",
      pickupAddress: pickup,
      destinationAddress: destination,
      destinationPhone: ship?.phone ?? undefined,
      postedPrice: 0,
    })
    const { data: admins } = (await query.graph({
      entity: "seller_admin",
      fields: ["id", "email", "phone"],
      filters: { seller_id: [input.sellerId] },
    })) as { data: any[] }
    const sender =
      (admins ?? []).find((a: any) => a?.email) ?? (admins ?? [])[0]
    const senderContact = sender?.email ?? sender?.phone
    if (senderContact) {
      await delivery.ensureParty(job.id, "sender", senderContact, input.sellerId)
    }
    await delivery.ensureParty(job.id, "recipient", input.buyerEmail)
    return { posted: true, jobId: job.id }
  } catch {
    return { posted: false }
  }
}
