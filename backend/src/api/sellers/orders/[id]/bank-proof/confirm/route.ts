import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../../../modules/marketplace/service"
import { DELIVERY_MODULE } from "../../../../../../modules/delivery"
import type DeliveryModuleService from "../../../../../../modules/delivery/service"
import { requireSellerPermission } from "../../../../../../lib/sellers/resolve-seller"
import { toBankTransferView } from "../../../../../../lib/bank-transfer/proof-view"
import { sendBankTransferNotice } from "../../../../../../lib/bank-transfer/notify"

// Seller confirms the buyer's bank transfer arrived. Also usable during the
// recheck window — a transfer that landed late can still be confirmed.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await requireSellerPermission(req, "orders")
  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const proof = await marketplace.confirmBankTransferProof(
    req.params.id,
    context.sellerId
  )

  await sendBankTransferNotice(req.scope, {
    to: proof.buyer_email,
    recipient: "buyer",
    kind: "bank_transfer_confirmed",
    subject: "Your bank transfer was confirmed — the store is fulfilling your order",
    bodyHtml: `The store confirmed your bank transfer for order ${proof.order_id}. You'll get a notification when it ships. Reference: ${proof.reference}.`,
    payload: { order_id: proof.order_id, reference: proof.reference },
  })

  // Courier-mode auto-post: payment confirmed + buyer chose courier delivery
  // → the job lands on the courier board by itself (open to offers, price 0).
  // Idempotent (one job per order) and best-effort — a missing pickup address
  // or ungeocodable address skips quietly; the seller one-click posts instead.
  try {
    if ((proof as any).delivery_mode === "courier") {
      const delivery =
        req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const existing = await delivery.listDeliveryJobs({ order_id: req.params.id } as any)
      if (!existing.length) {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
        const { data: [seller] } = (await query.graph({
          entity: "seller",
          fields: ["id", "name", "pickup_address"],
          filters: { id: [context.sellerId] },
        })) as { data: any[] }
        const { data: [order] } = (await query.graph({
          entity: "order",
          fields: [
            "id",
            "email",
            "shipping_address.address_1",
            "shipping_address.city",
            "shipping_address.phone",
            "items.title",
            "items.quantity",
          ],
          filters: { id: req.params.id },
        })) as { data: any[] }
        const pickup = (seller as any)?.pickup_address as string | undefined
        const ship = (order as any)?.shipping_address
        const destination = [ship?.address_1, ship?.city].filter(Boolean).join(", ")
        if (pickup && destination) {
          const titles = ((order as any)?.items ?? []).map(
            (i: any) => `${i.quantity > 1 ? `${i.quantity}x ` : ""}${i.title ?? "item"}`
          )
          const job = await delivery.postJob({
            orderId: req.params.id,
            sellerId: context.sellerId,
            packageDescription: titles.length ? titles.join(", ") : "Order items",
            pickupAddress: pickup,
            destinationAddress: destination,
            destinationPhone: ship?.phone ?? undefined,
            postedPrice: 0,
          })
          const { data: admins } = (await query.graph({
            entity: "seller_admin",
            fields: ["id", "email", "phone"],
            filters: { seller_id: [context.sellerId] },
          })) as { data: any[] }
          const sender = (admins ?? []).find((a: any) => a?.email) ?? (admins ?? [])[0]
          const senderContact = sender?.email ?? sender?.phone
          if (senderContact) {
            await delivery.ensureParty(job.id, "sender", senderContact, context.sellerId)
          }
          await delivery.ensureParty(job.id, "recipient", proof.buyer_email)
        }
      }
    }
  } catch {
    // Auto-post never fails the seller's confirm.
  }

  res.json({ order_id: req.params.id, transfer: await toBankTransferView(proof) })
}
