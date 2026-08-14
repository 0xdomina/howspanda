import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PatchSellerMobileProductSchema } from "../../../middlewares"
import updateSellerProductWorkflow from "../../../../workflows/marketplace/update-seller-product"
import { requireSellerPermission } from "../../../../lib/sellers/resolve-seller"
import { applyPromotionMetadata } from "../../../../lib/marketplace-promotions"

type PatchProductBody = z.infer<typeof PatchSellerMobileProductSchema>

// Seller edits a product they own: base fields (title/description/photo/
// status) plus per-variant price/stock. Ownership is enforced inside the
// workflow (seller -> seller -> products link).
export const PATCH = async (
  req: AuthenticatedMedusaRequest<PatchProductBody>,
  res: MedusaResponse
) => {
  await requireSellerPermission(req, "products")
  const body = req.validatedBody

  const update: {
    title?: string
    description?: string
    thumbnail?: string | null
    images?: { url: string }[]
    status?: "draft" | "published" | "archived"
    metadata?: Record<string, unknown>
  } = {}
  if (body.title !== undefined) update.title = body.title
  if (body.description !== undefined) update.description = body.description
  if (body.photos !== undefined) {
    update.thumbnail = body.photos[0] ?? null
    update.images = body.photos.map((url) => ({ url }))
  } else if (body.photo !== undefined) {
    update.thumbnail = body.photo
    update.images = [{ url: body.photo }]
  }
  if (body.status !== undefined) update.status = body.status

  // Product media and promotion settings live in metadata; merge so we never
  // clobber unrelated product metadata.
  if (
    body.video_url !== undefined ||
    body.flash_sale !== undefined ||
    body.homepage_banner !== undefined ||
    body.banner_url !== undefined
  ) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: [current] } = await query.graph({
      entity: "product",
      fields: ["metadata"],
      filters: { id: req.params.id },
    })
    const currentMetadata = {
      ...((current?.metadata ?? {}) as Record<string, unknown>),
    }
    if (body.video_url !== undefined) currentMetadata.product_video = body.video_url
    update.metadata = applyPromotionMetadata(currentMetadata, {
      flashSale: body.flash_sale,
      homepageBanner: body.homepage_banner,
      homepageBannerImage: body.banner_url,
    })
  }

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
