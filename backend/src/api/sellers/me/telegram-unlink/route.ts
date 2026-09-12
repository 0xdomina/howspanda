import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import { requireSellerOwner } from "../../../../lib/sellers/resolve-seller"

// Owner unlinks the store's Telegram chat: alerts stop immediately.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await requireSellerOwner(req)

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  await marketplace.updateSellers({
    id: context.sellerId,
    telegram_chat_id: null,
    telegram_link_code: null,
    telegram_link_expires_at: null,
  })

  res.json({ linked: false })
}
