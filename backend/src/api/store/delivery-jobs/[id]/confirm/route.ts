import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../modules/delivery/service"
import BuyerWalletModuleService from "../../../../../modules/buyer-wallet/service"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import { BUYER_WALLET_MODULE } from "../../../../../modules/buyer-wallet"
import { resolveActorEmail } from "../../../../../lib/accounts/resolve-actor-email"

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const recipientEmail = await resolveActorEmail(req)

  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const result = await deliveryService.confirmDelivery(id, recipientEmail)

  // Release the agreed price to the courier's buyer wallet (source
  // `delivery_payout`). The courier wallet is credited lazily on first payout.
  if (result.courierEmail && result.payout > 0) {
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
