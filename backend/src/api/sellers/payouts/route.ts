import { randomUUID } from "node:crypto"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import createPayoutWorkflow from "../../../workflows/marketplace/create-payout"
import { PostSellerPayoutSchema } from "../../middlewares"
import { z } from "@medusajs/framework/zod"

type PostSellerPayoutBody = z.infer<typeof PostSellerPayoutSchema>

async function resolveSellerId(
  req: AuthenticatedMedusaRequest
): Promise<string> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  return sellerAdmin.seller.id
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const payouts = await marketplace.listPayouts(
    { seller_id: sellerId },
    { order: { created_at: "DESC" } }
  )

  res.json({ payouts })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostSellerPayoutBody>,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const body = req.validatedBody

  // Replaying the same idempotency_key returns the SAME payout — the
  // workflow's guard short-circuits before any step touches the ledger.
  const idempotencyKey =
    body.idempotency_key ?? `po-req-${randomUUID().replace(/-/g, "")}`

  const { result: payout } = await createPayoutWorkflow(req.scope).run({
    input: {
      seller_id: sellerId,
      rail: body.rail,
      idempotency_key: idempotencyKey,
      requested_by: "seller",
    },
  })

  res.json({ payout })
}
