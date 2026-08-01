import { MedusaError } from "@medusajs/framework/utils"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import MallModuleService from "../../../../../modules/mall/service"
import BuyerWalletModuleService from "../../../../../modules/buyer-wallet/service"
import { MALL_MODULE } from "../../../../../modules/mall"
import { BUYER_WALLET_MODULE } from "../../../../../modules/buyer-wallet"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as { buyerEmail: string; orderId: string }

  if (!body?.buyerEmail || !body?.orderId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "buyerEmail and orderId are required"
    )
  }

  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const result = await mallService.recordPurchase({
    mallId: id,
    buyerEmail: body.buyerEmail,
    orderId: body.orderId,
  })

  // If buyer won, credit their wallet and link the prize record to the ledger
  if (result?.won) {
    const buyerWalletService = req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)
    const { ledger } = await buyerWalletService.credit({
      buyerEmail: body.buyerEmail,
      amount: result.prizeAmount,
      source: "mall_prize",
      reference: body.orderId,
    })
    const prizes = await mallService.listMallPrizes({
      mall_id: id,
      winner_buyer_email: body.buyerEmail,
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
