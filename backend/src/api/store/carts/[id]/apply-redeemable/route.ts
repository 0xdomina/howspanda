import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  promiseAll,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { REDEEMABLES_MODULE } from "../../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../../modules/redeemables/service"
import { PostApplyRedeemableSchema } from "../../../../middlewares"

type PostBody = z.infer<typeof PostApplyRedeemableSchema>

export const POST = async (
  req: MedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [cart] } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "metadata",
      "items.id",
      "items.subtotal",
      "items.product_id",
    ],
    filters: { id: req.params.id },
  })
  if (!cart || !cart.items?.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found")
  }

  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)
  const redeemable = await redeemables.getUsableByCode(req.validatedBody.code)

  // store-scoped, always: every item must belong to the code's store
  await promiseAll(
    cart.items.map(async (item) => {
      const { data: [product] } = await query.graph({
        entity: "product",
        fields: ["id", "seller.*"],
        filters: { id: item?.product_id || "" },
      })
      if (product?.seller?.id !== redeemable.seller_id) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "This code only works at its issuing store — remove other stores' items first"
        )
      }
    })
  )

  const base = cart.items.reduce(
    (sum, item) => sum + Number(item?.subtotal ?? 0),
    0
  )
  const amount = redeemables.checkoutAmountFor(redeemable, base)
  if (amount <= 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This code has no value against this cart"
    )
  }

  // greedy allocation, capped per item
  let remaining = amount
  const adjustments: {
    item_id: string
    amount: number
    code: string
    description: string
  }[] = []
  for (const item of cart.items) {
    if (!item || remaining <= 0) {
      continue
    }
    const take = Math.min(Number(item.subtotal ?? 0), remaining)
    if (take > 0) {
      adjustments.push({
        item_id: item.id,
        amount: take,
        code: redeemable.code,
        description: redeemable.title,
      })
      remaining -= take
    }
  }

  const cartModule = req.scope.resolve(Modules.CART)
  await cartModule.setLineItemAdjustments(cart.id, adjustments)
  await cartModule.updateCarts([
    {
      id: cart.id,
      metadata: {
        ...(cart.metadata ?? {}),
        redeemable_code: redeemable.code,
        redeemable_amount: amount,
        redeemable_base_total: base,
      },
    },
  ])

  res.json({
    cart_id: cart.id,
    code: redeemable.code,
    amount_applied: amount,
  })
}
