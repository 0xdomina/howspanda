import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getTrustScore } from "../../../lib/reviews/trust-score"
import { resolveSellerId } from "../../../lib/reviews/resolve-seller"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const trust = await getTrustScore(req.scope, sellerId)
  res.json(trust)
}
