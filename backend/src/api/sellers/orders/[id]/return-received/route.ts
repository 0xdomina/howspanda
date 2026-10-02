import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { NIMIQ_MODULE } from "../../../../../modules/nimiq"
import type NimiqModuleService from "../../../../../modules/nimiq/service"
import { NOTIFICATIONS_MODULE } from "../../../../../modules/notifications"
import type NotificationsModuleService from "../../../../../modules/notifications/service"
import { requireSellerPermission } from "../../../../../lib/sellers/resolve-seller"

const resolveOwnedLine = async (
  req: AuthenticatedMedusaRequest,
  orderId: string
) => {
  const context = await requireSellerPermission(req, "orders")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: admins } = await query.graph({
    entity: "seller_admin",
    fields: ["seller.id"],
    filters: { id: context.sellerAdminId },
  })
  const sellerId = admins[0]?.seller?.id
  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  const [line] = await marketplace.listCommissionLines({ order_id: orderId })
  if (!line || !sellerId || line.seller_id !== sellerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
  }
  return { marketplace, line }
}

// Seller confirms the returned goods are back → the sale unwinds and the
// commission line reverses. The buyer's money refund is the Phase 4
// provider refund (admin-triggered) — this touches the ledger only.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { marketplace, line } = await resolveOwnedLine(req, req.params.id)

  if (!line.held_at || line.status !== "pending") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No open return on this order"
    )
  }

  const commissionLine = await marketplace.reverseCommissionForOrder(
    req.params.id,
    "return received by seller"
  )

  // Crypto-paid orders: the ledger reversal above is only half the refund.
  // Send the tokens back to the verified payer automatically (best-effort).
  let cryptoRefund: { status: string; tx_hash?: string | null } | null = null
  try {
    const nimiq: NimiqModuleService = req.scope.resolve(NIMIQ_MODULE)
    const payout = await nimiq.requestPayout({ orderId: req.params.id })
    const done = await nimiq.executePayout(payout.id).catch(() => null)
    cryptoRefund = done
      ? { status: (done as any).status, tx_hash: (done as any).tx_hash ?? null }
      : { status: "failed" }
    if (done && (done as any).status === "confirmed") {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: [order] } = (await query.graph({
        entity: "order",
        fields: ["id", "email"],
        filters: { id: [req.params.id] },
      }).catch(() => ({ data: [] }))) as { data: any[] }
      if ((order as any)?.email) {
        const notifications =
          req.scope.resolve<NotificationsModuleService>(NOTIFICATIONS_MODULE)
        await notifications
          .enqueueEmail({
            kind: "crypto_refund_confirmed",
            recipient: "buyer",
            to: (order as any).email,
            subject: "Your refund is on its way",
            body_html: `Your refund for order ${req.params.id} has been sent on chain. It lands in your wallet shortly.`,
            payload: { order_id: req.params.id },
          })
          .catch(() => null)
      }
    }
  } catch {
    cryptoRefund = { status: "skipped" }
  }

  res.json({ commission_line: commissionLine, crypto_refund: cryptoRefund })
}
