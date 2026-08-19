import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { PRODUCT_REQUESTS_MODULE } from "../../../../../modules/product-requests"
import ProductRequestsModuleService from "../../../../../modules/product-requests/service"
import { FOLLOWS_MODULE } from "../../../../../modules/follows"
import FollowsModuleService from "../../../../../modules/follows/service"
import { resolveSellerByHandle } from "../../../../../lib/sellers/resolve-seller"
import { PostProductRequestSchema } from "../../../../middlewares"

type Body = z.infer<typeof PostProductRequestSchema>

export const POST = async (req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) => {
  const customerId = req.auth_context.actor_id as string
  const { id: sellerId, name, handle } = await resolveSellerByHandle(req, req.params.handle)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [customer] } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: { id: customerId },
  })
  if (!customer?.email) {
    res.status(401).json({ message: "Sign in to send a request." })
    return
  }

  const requests = req.scope.resolve<ProductRequestsModuleService>(PRODUCT_REQUESTS_MODULE)
  const result = await requests.createBuyerRequest({
    customerId,
    buyerEmail: customer.email,
    sellerId,
    request: req.validatedBody.request,
  })

  if (!result.duplicate) {
    const follows = req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)
    await follows.createCustomerNotification({
      customer_id: customerId,
      kind: "product_request_update",
      seller_id: sellerId,
      actor_label: name,
      actor_handle: handle,
      title: "Request sent",
      body: `Your request is with ${name}. We’ll let you know when it is updated.`,
      payload: { request_id: result.request.id, status: result.request.status },
    })
  }

  res.status(result.duplicate ? 200 : 201).json({ request: result.request, duplicate: result.duplicate })
}
