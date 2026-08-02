import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { PatchSellerMobileProductSchema } from "../../../middlewares"
import updateSellerProductWorkflow from "../../../../workflows/marketplace/update-seller-product"

type PatchProductBody = z.infer<typeof PatchSellerMobileProductSchema>

// Seller edits a product they own: base fields (title/description/photo/
// status) plus per-variant price/stock. Ownership is enforced inside the
// workflow (seller -> seller -> products link).
export const PATCH = async (
  req: AuthenticatedMedusaRequest<PatchProductBody>,
  res: MedusaResponse
) => {
  const body = req.validatedBody

  const update: {
    title?: string
    description?: string
    thumbnail?: string | null
    status?: "draft" | "published" | "archived"
  } = {}
  if (body.title !== undefined) update.title = body.title
  if (body.description !== undefined) update.description = body.description
  if (body.photo !== undefined) update.thumbnail = body.photo
  if (body.status !== undefined) update.status = body.status

  const { result } = await updateSellerProductWorkflow(req.scope).run({
    input: {
      seller_admin_id: req.auth_context.actor_id,
      product_id: req.params.id,
      update,
      variants: body.variants,
    },
  })

  res.json({
    product: result.product,
  })
}
