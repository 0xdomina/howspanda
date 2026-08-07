import {
  MedusaError,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import MallModuleService from "../../../../../modules/mall/service"
import BuyerWalletModuleService from "../../../../../modules/buyer-wallet/service"
import { MALL_MODULE } from "../../../../../modules/mall"
import { BUYER_WALLET_MODULE } from "../../../../../modules/buyer-wallet"
import { resolveActorEmail } from "../../../../../lib/accounts/resolve-actor-email"

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as { buyerEmail?: string; orderId: string }

  // Signed-in buyers act as themselves (actor-derived email); guests use the
  // order-matching email ownership flow.
  let buyerEmail = body?.buyerEmail?.trim()
  if (req.auth_context?.actor_id) {
    buyerEmail = await resolveActorEmail(req)
  }
  if (!buyerEmail || !body?.orderId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "buyerEmail and orderId are required"
    )
  }

  // H1: a mall prize must only be awarded for a real order that belongs to
  // this buyer. An unauth caller could otherwise spam fabricated order ids
  // with fresh emails until a win rolled and drain the prize pool.
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "email"],
    filters: { id: body.orderId },
  })
  if (
    !order ||
    (order.email ?? "").toLowerCase() !== buyerEmail.toLowerCase()
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Order not found for this buyer"
    )
  }

  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const result = await mallService.recordPurchase({
    mallId: id,
    buyerEmail,
    orderId: body.orderId,
  })

  // If buyer won, credit their wallet and link the prize record to the ledger
  if (result?.won) {
    const buyerWalletService = req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)
    const { ledger } = await buyerWalletService.credit({
      buyerEmail,
      amount: result.prizeAmount,
      source: "mall_prize",
      reference: body.orderId,
    })
    const prizes = await mallService.listMallPrizes({
      mall_id: id,
      winner_buyer_email: buyerEmail,
    })
    if (prizes.length) {
      await mallService.updateMallPrizes({
        id: prizes[prizes.length - 1].id,
        wallet_ledger_id: ledger.id,
        claimed: true,
      })
    }
  }

  res.json({ result })
}
