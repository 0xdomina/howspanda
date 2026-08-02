import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { PostSellerMobileProductSchema } from "../../middlewares"
import createSellerProductWorkflow from "../../../workflows/marketplace/create-seller-product"

type MobileProductBody = z.infer<typeof PostSellerMobileProductSchema>

// A mobile-first listing is title + photo + price + short description. Map it
// onto the full product shape (published, default "One Size" option/variant,
// no inventory tracking) so the create-product workflow accepts it. Full
// admin-shape payloads (variants/options/status supplied) pass through.
function toFullProductShape(
  body: MobileProductBody
): HttpTypes.AdminCreateProduct {
  if (body.variants || body.options) {
    return body as unknown as HttpTypes.AdminCreateProduct
  }

  return {
    title: body.title,
    description: body.description,
    handle: body.handle,
    status: body.status ?? "published",
    thumbnail: body.photo ?? null,
    images: body.images ?? (body.photo ? [{ url: body.photo }] : []),
    options: [{ title: "One Size", values: ["One Size"] }],
    variants: [
      {
        title: "One Size",
        manage_inventory: false,
        options: { "One Size": "One Size" },
        prices: body.price
          ? [{ currency_code: body.currency_code, amount: body.price }]
          : [],
      },
    ],
  }
}

export const POST = async (
  req: AuthenticatedMedusaRequest<MobileProductBody>,
  res: MedusaResponse
) => {
  const product = toFullProductShape(req.validatedBody)

  const { result } = await createSellerProductWorkflow(req.scope)
    .run({
      input: {
        seller_admin_id: req.auth_context.actor_id,
        product,
      },
    })

  res.json({
    product: result.product,
  })
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["seller.products.*"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  if (!sellerAdmin) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  res.json({
    products: sellerAdmin.seller.products ?? [],
  })
}
