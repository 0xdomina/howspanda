import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { WISHLIST_MODULE } from "../../../modules/wishlist"
import WishlistModuleService, { WishlistItemInput } from "../../../modules/wishlist/service"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const wishlist = req.scope.resolve<WishlistModuleService>(WISHLIST_MODULE)
  const items = await wishlist.getCustomerWishlist(req.auth_context.actor_id as string)
  res.json({ items })
}

export const PUT = async (
  req: AuthenticatedMedusaRequest<{ items: WishlistItemInput[] }>,
  res: MedusaResponse
) => {
  const wishlist = req.scope.resolve<WishlistModuleService>(WISHLIST_MODULE)
  const items = await wishlist.replaceCustomerWishlist(
    req.auth_context.actor_id as string,
    req.validatedBody.items
  )
  res.json({ items })
}
