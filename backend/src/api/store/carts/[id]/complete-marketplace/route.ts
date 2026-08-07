import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import createSellerOrdersWorkflow from "../../../../../workflows/marketplace/create-seller-orders"
import { REDEEMABLES_MODULE } from "../../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../../modules/redeemables/service"
import { GROWTH_MODULE } from "../../../../../modules/growth"
import GrowthModuleService from "../../../../../modules/growth/service"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const cartId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)

  const { data: [cart] } = await query.graph({
    entity: "cart",
    fields: ["id", "total", "metadata"],
    filters: { id: cartId },
  })
  const code = cart?.metadata?.redeemable_code as string | undefined

  // consume first — the buyer must never be charged against a dead code;
  // the value comes back (compensation below) if anything downstream fails
  let consumption:
    | Awaited<ReturnType<RedeemablesModuleService["consumeAtCheckout"]>>
    | undefined
  if (code) {
    consumption = await redeemables.consumeAtCheckout(code, {
      order_total: Number(
        cart?.metadata?.redeemable_base_total ?? cart?.total ?? 0
      ),
    })
  }

  try {
    const { result } = await createSellerOrdersWorkflow(req.scope).run({
      input: {
        cart_id: cartId,
      },
    })

    if (consumption) {
      await redeemables.updateRedemptions([
        { id: consumption.redemption.id, order_id: result.order.id },
      ])
    }

    // Campaign #2 hook: qualifying spend accrues arc_pool revenue-share + raffle
    // tickets (idempotent per order) for any live arc_pool challenge.
    if (result.order.email) {
      await growth.recordBuyerSpend({
        buyerEmail: result.order.email,
        // order.total is kobo (minor unit); the challenge ledger is in naira.
        amountNgn: Number(result.order.total ?? 0) / 100,
        orderId: result.order.id,
      })
    }

    res.json({
      type: "order",
      order: result.order,
      ...(consumption
        ? { redeemable_applied: consumption.amount_applied }
        : {}),
    })
  } catch (e) {
    if (consumption) {
      await redeemables.undoCheckoutConsumption(consumption.redemption.id)
    }
    throw e
  }
}
