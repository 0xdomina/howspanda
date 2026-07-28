import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import { answerInsightsQuestion } from "../../../../lib/ai/capabilities"
import {
  getSellerOrders,
  getSellerProducts,
} from "../../../../lib/ai/seller-context"
import { PostAiInsightsSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAiInsightsSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  await runAiRoute(req, res, "insights", async ({ query, seller }) => {
    // context is built ONLY from this seller's own data
    const [products, orders] = await Promise.all([
      getSellerProducts(query, seller.seller_id),
      getSellerOrders(query, seller.seller_id),
    ])

    const contextJson = JSON.stringify({
      seller_name: seller.seller_name,
      products,
      orders,
    })

    return await answerInsightsQuestion({
      question: req.validatedBody.question,
      contextJson,
    })
  })
}
