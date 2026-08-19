import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { PRODUCT_REQUESTS_MODULE } from "../../../../modules/product-requests"
import ProductRequestsModuleService from "../../../../modules/product-requests/service"
import { FOLLOWS_MODULE } from "../../../../modules/follows"
import FollowsModuleService from "../../../../modules/follows/service"
import { requireSellerPermission } from "../../../../lib/sellers/resolve-seller"
import { PatchProductRequestSchema } from "../../../middlewares"

type Body = z.infer<typeof PatchProductRequestSchema>

export const PATCH = async (req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) => {
  const { sellerId } = await requireSellerPermission(req, "requests")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const requests = req.scope.resolve<ProductRequestsModuleService>(PRODUCT_REQUESTS_MODULE)
  const [before] = await requests.listProductRequests({ id: req.params.id, seller_id: sellerId })
  if (!before) {
    res.status(404).json({ message: "Request not found" })
    return
  }

  if (req.validatedBody.status === "available" && req.validatedBody.product_id) {
    const { data: [sellerAdmin] } = await query.graph({
      entity: "seller_admin",
      fields: ["seller.products.id"],
      filters: { id: req.auth_context.actor_id },
    })
    const owned = (sellerAdmin?.seller?.products ?? []).filter(Boolean).some(
      (product: any) => product.id === req.validatedBody.product_id
    )
    if (!owned) {
      res.status(400).json({ message: "Choose one of your store products." })
      return
    }
  }

  const updated = await requests.updateForSeller(req.params.id, sellerId, {
    status: req.validatedBody.status,
    sellerNote: req.validatedBody.seller_note,
    productId: req.validatedBody.product_id,
  })

  const follows = req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)
  const { data: [seller] } = await query.graph({
    entity: "seller",
    fields: ["name", "handle"],
    filters: { id: sellerId },
  })
  const statusCopy: Record<string, string> = {
    reviewing: "The store is reviewing your request.",
    available: "Your requested item is now available.",
    not_available: "The store cannot stock this request right now.",
    closed: "This request has been closed.",
  }
  await follows.createCustomerNotification({
    customer_id: before.customer_id,
    kind: "product_request_update",
    seller_id: sellerId,
    actor_label: seller?.name ?? "Store",
    actor_handle: seller?.handle ?? null,
    title: "Your store request was updated",
    body: req.validatedBody.seller_note?.trim()
      ? `${statusCopy[updated.status]} ${req.validatedBody.seller_note.trim()}`
      : statusCopy[updated.status],
    payload: { request_id: updated.id, status: updated.status, product_id: updated.product_id },
  })

  res.json({ request: updated })
}
