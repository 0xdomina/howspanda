import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "@medusajs/framework/zod"
import { REDEEMABLES_MODULE } from "../../../modules/redeemables"
import RedeemablesModuleService from "../../../modules/redeemables/service"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import { PostSellerRedeemableSchema } from "../../middlewares"
import {
  requireSellerOwner,
  requireSellerPermission,
} from "../../../lib/sellers/resolve-seller"

type PostBody = z.infer<typeof PostSellerRedeemableSchema>

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await requireSellerPermission(req, "redeemables")
  const sellerId = context.sellerId
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

  const filters: Record<string, unknown> = { seller_id: sellerId }
  if (typeof req.query.type === "string") filters.type = req.query.type
  if (typeof req.query.status === "string") filters.status = req.query.status

  const items = await redeemables.listRedeemables(filters, {
    order: { created_at: "DESC" },
  })
  res.json({ redeemables: items })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const context = await requireSellerOwner(req)
  const sellerId = context.sellerId
  const body = req.validatedBody
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

  // Priced ⇒ purchasable template: exactly one row; the linked product is
  // what buyers add to carts, and each sale mints a fresh coded instance.
  if (body.price && body.quantity !== 1) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Priced templates are single rows — sales mint instances per purchase"
    )
  }

  const minted = await redeemables.mintRedeemables(
    {
      seller_id: sellerId,
      type: body.type,
      title: body.title,
      design_variant: body.design_variant,
      background_image: body.background_image,
      accent_color: body.accent_color,
      message: body.message,
      face_value: body.face_value,
      discount_type: body.discount_type,
      discount_value: body.discount_value,
      price: body.price,
      expires_at: body.expires_at,
      issued_to_email: body.issued_to_email,
    },
    body.quantity
  )

  if (body.price) {
    const template = minted[0]
    const { result: [product] } = await createProductsWorkflow(req.scope).run({
      input: {
        products: [
          {
            title: body.title,
            status: "published",
            options: [{ title: "Default", values: ["Default"] }],
            variants: [
              {
                title: body.title,
                options: { Default: "Default" },
                manage_inventory: false,
                prices: [{ amount: body.price, currency_code: "ngn" }],
              },
            ],
            metadata: { redeemable_template_id: template.id },
          },
        ],
      },
    })

    const link = req.scope.resolve(ContainerRegistrationKeys.LINK)
    await link.create([
      {
        [MARKETPLACE_MODULE]: { seller_id: sellerId },
        [Modules.PRODUCT]: { product_id: product.id },
      },
    ])

    const [updated] = await redeemables.updateRedeemables([
      { id: template.id, product_id: product.id },
    ])
    res.status(201).json({ redeemables: [updated], product_id: product.id })
    return
  }

  res.status(201).json({ redeemables: minted })
}
