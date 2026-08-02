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

type ProductPayload = HttpTypes.AdminCreateProduct & {
  variants?: (HttpTypes.AdminCreateProductVariant & { stock?: number })[]
}

// A mobile-first listing is title + photo + price + short description. Map it
// onto the full product shape (published, default "One Size" option/variant,
// no inventory tracking) so the create-product workflow accepts it. Full
// admin-shape payloads (variants/options/status supplied) pass through. The
// workflow keeps `stock` (quantity to sell) per variant as inventory levels.
function toFullProductShape(
  body: MobileProductBody
): ProductPayload {
  if (body.variants || body.options) {
    return body as unknown as ProductPayload
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
        manage_inventory: body.stock != null,
        options: { "One Size": "One Size" },
        stock: body.stock,
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
  const body = req.validatedBody
  const product = toFullProductShape(body)

  // Per-variant quantity to sell, aligned by index with product.variants.
  const stocks = product.variants?.map(
    (variant: { stock?: number }) => variant.stock
  )

  // `stock` is workflow-side metadata; strip it from the product payload so
  // the product workflow never sees an unknown field.
  const cleanVariants = product.variants?.map(
    ({ stock, ...rest }: { stock?: number }) => rest
  )
  const cleanProduct = { ...product, variants: cleanVariants }

  const { result } = await createSellerProductWorkflow(req.scope)
    .run({
      input: {
        seller_admin_id: req.auth_context.actor_id,
        product: cleanProduct as HttpTypes.AdminCreateProduct,
        stocks,
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
    fields: [
      "seller.products.*",
      "seller.products.options.*",
      "seller.products.options.values.*",
      "seller.products.variants.*",
      "seller.products.variants.options.*",
      "seller.products.variants.prices.*",
      "seller.products.variants.inventory_items.inventory_item_id",
      "seller.products.images.*",
    ],
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