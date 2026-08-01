import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../modules/delivery/service"
import BuyerWalletModuleService from "../../../../../modules/buyer-wallet/service"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import { BUYER_WALLET_MODULE } from "../../../../../modules/buyer-wallet"

// The sender (pickup) or recipient (delivery) submits the in-app code the
// courier showed them. Delivery verification releases the payout, so we credit
// the courier wallet here too.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as { email: string; code: string; purpose: "pickup" | "delivery" }

  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const result = await deliveryService.verify(id, body.code, body.purpose, body.email)

  if (result.courierEmail && typeof result.payout === "number" && result.payout > 0) {
    const buyerWalletService = req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)
    await buyerWalletService.credit({
      buyerEmail: result.courierEmail,
      amount: result.payout,
      source: "delivery_payout",
      reference: id,
    })
  }

  res.json(result)
}
