import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import createSellerOrdersWorkflow from "../../../../../workflows/marketplace/create-seller-orders"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const cartId = req.params.id

  const { result } = await createSellerOrdersWorkflow(req.scope)
    .run({
      input: {
        cart_id: cartId,
      },
    })

  res.json({
    type: "order",
    order: result.order,
  })
}
