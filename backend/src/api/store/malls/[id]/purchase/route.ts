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
  const body = req.validatedBody as { orderId: string }
  const buyerEmail = await resolveActorEmail(req)
  if (!buyerEmail || !body?.orderId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "orderId is required"
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

  // If buyer won (or a previous request created the prize before a transient
  // wallet failure), finish the reward exactly once. The wallet ledger uses
  // the prize id as its idempotency reference.
  const prizeRows = await mallService.listMallPrizes({
    mall_id: id,
    winner_buyer_email: buyerEmail,
  })
  const pendingPrize = prizeRows.find((prize: any) => !prize.wallet_ledger_id)
  if (pendingPrize && (result?.won || prizeRows.length > 0)) {
    const buyerWalletService = req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)
    const { ledger } = await buyerWalletService.credit({
      buyerEmail,
      amount: Number(pendingPrize.amount_ngn),
      source: "mall_prize",
      reference: pendingPrize.id,
    })
    await mallService.updateMallPrizes({
      id: pendingPrize.id,
      wallet_ledger_id: ledger.id,
      claimed: true,
      claimed_at: new Date(),
    })
  }

  res.json({ result })
}
