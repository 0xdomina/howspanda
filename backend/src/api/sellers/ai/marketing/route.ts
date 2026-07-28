import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import { coachMarketing } from "../../../../lib/ai/capabilities"
import { getSellerProducts } from "../../../../lib/ai/seller-context"
import { PostAiMarketingSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAiMarketingSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  await runAiRoute(req, res, "marketing", async ({ query, seller }) => {
    const products = await getSellerProducts(query, seller.seller_id)

    return await coachMarketing({
      goal: req.validatedBody.goal,
      tone: req.validatedBody.tone,
      productsJson: JSON.stringify(products),
    })
  })
}
