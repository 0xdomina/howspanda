import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { TIPPING_MODULE } from "../../../modules/tipping"
import TippingModuleService from "../../../modules/tipping/service"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import type MarketplaceModuleService from "../../../modules/marketplace/service"
import { REDEEMABLES_MODULE } from "../../../modules/redeemables"
import type RedeemablesModuleService from "../../../modules/redeemables/service"
import { PostSellerTipSchema } from "../../middlewares"
import { requireSellerOwner } from "../../../lib/sellers/resolve-seller"
import { BUYER_WALLET_MODULE } from "../../../modules/buyer-wallet"
import BuyerWalletModuleService from "../../../modules/buyer-wallet/service"
import { FOLLOWS_MODULE } from "../../../modules/follows"
import FollowsModuleService from "../../../modules/follows/service"
import { randomUUID } from "node:crypto"

type PostBody = z.infer<typeof PostSellerTipSchema>

async function resolveSellerId(
  req: AuthenticatedMedusaRequest
): Promise<string> {
  const context = await requireSellerOwner(req)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id"],
    filters: { id: [context.sellerAdminId] },
  })
  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }
  return sellerAdmin.seller.id
}

// Seller's tip ledger: everything given and received.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await requireSellerOwner(req)
  const sellerId = await resolveSellerId(req)
  const tipping: TippingModuleService = req.scope.resolve(TIPPING_MODULE)

  const tips = await tipping.listForSeller(sellerId)
  const summary = await tipping.summary(sellerId)

  res.json({ tips, summary })
}

// Seller → buyer thank-you (cash, extra product, or a gifted store code).
export const POST = async (
  req: AuthenticatedMedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  await requireSellerOwner(req)
  const sellerId = await resolveSellerId(req)
  const body = req.validatedBody
  const tipping: TippingModuleService = req.scope.resolve(TIPPING_MODULE)
  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const wallet = req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)
  const follows = req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const redeemables = req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)
  const { data: [recipient] } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: { email: body.buyer_email.trim().toLowerCase() },
  })
  if (!recipient?.id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Buyer account not found")
  }

  const isCash = Number.isFinite(body.amount) && (body.amount as number) > 0
  const isProduct = !isCash && !!body.product_id
  const isInstrument = !isCash && !isProduct && !!body.redeemable_code
  if (!isCash && !isProduct && !isInstrument) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A seller tip needs a cash amount, an extra product, or a gifted store code"
    )
  }

  let commissionLineId: string | null = null
  if (isCash) {
    const settlementAmount = Math.round(Number(body.amount) * 100)
    // a seller can only gift what they actually have available
    const balances = await marketplace.getSellerBalance(sellerId)
    const available = balances.ngn?.available ?? 0
    if (settlementAmount > available + 0.001) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Seller available balance is insufficient for this tip"
      )
    }
    // negative ledger line: the cash flows OUT of the seller's balance
    const line = await marketplace.createCommissionLines([
      {
        order_id: `tip:${sellerId}:gift:${randomUUID()}`,
        currency_code: "ngn",
        order_total: -settlementAmount,
        rate: 0,
        commission_amount: 0,
        net_amount: -settlementAmount,
        status: "available",
        available_at: new Date(),
        seller_id: sellerId,
      },
    ])
    commissionLineId = line[0]?.id ?? null
  }

  // Gifting one of the seller's own store instruments (gift card / voucher /
  // ticket): the code's value is addressed to the buyer — no cash moves. Foreign
  // or spent codes are invisible (404), matching the redeemables convention.
  let redeemableId: string | null = null
  let redeemableCode: string | null = null
  let productTitle = body.product_title ?? null
  if (isProduct) {
    const { data: [sellerAdmin] } = await query.graph({
      entity: "seller_admin",
      fields: ["seller.products.id", "seller.products.title", "seller.products.variants.prices.amount", "seller.products.variants.prices.currency_code"],
      filters: { id: req.auth_context.actor_id },
    })
    const product = (sellerAdmin?.seller?.products ?? []).find(
      (item: any) => item?.id === body.product_id
    )
    if (!product) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found in your store")
    }
    productTitle = product.title
    const priceMinor = Number(
      product.variants?.flatMap((variant: any) => variant.prices ?? [])
        .find((price: any) => price.currency_code === "ngn")?.amount ?? 0
    )
    if (!(priceMinor > 0)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "This product needs a price before it can be gifted")
    }
    const [gift] = await redeemables.mintRedeemables({
      seller_id: sellerId,
      type: "product_gift",
      title: `${productTitle} gift`,
      message: body.note ?? "A product gift from the store",
      face_value: Math.max(1, Math.round(priceMinor / 100)),
      product_id: product.id,
      issued_to_email: body.buyer_email,
      expires_at: new Date(Date.now() + 30 * 86400000),
    })
    redeemableId = gift.id
    redeemableCode = gift.code
  }
  if (isInstrument) {
    const [redeem] = await redeemables.listRedeemables({
      code: (body.redeemable_code as string).toUpperCase(),
    })
    if (
      !redeem ||
      redeem.seller_id !== sellerId ||
      redeem.status !== "active" ||
      Boolean(redeem.issued_to_email)
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Code not found"
      )
    }
    await redeemables.updateRedeemables([
      { id: redeem.id, issued_to_email: body.buyer_email },
    ])
    redeemableId = redeem.id
    redeemableCode = redeem.code
  }

  let tip: any
  try {
    tip = await tipping.createTip({
      direction: "to_buyer",
      orderId: body.order_id,
      buyerEmail: body.buyer_email,
      sellerId,
      amount: isCash ? Number(body.amount) : null,
      productId: body.product_id,
      productTitle,
      redeemableId,
      redeemableCode,
      note: body.note,
      commissionLineId,
    })

    if (isCash) {
      await wallet.credit({
        buyerEmail: body.buyer_email,
        amount: Number(body.amount),
        source: "tip_credit",
        reference: `tip:${tip.id}`,
        currencyCode: "ngn",
      })
    }
  } catch (error) {
    if (commissionLineId) {
      await marketplace.updateCommissionLines({ id: commissionLineId, status: "reversed" })
    }
    if (tip?.id) {
      await tipping.updateTips({ id: tip.id, status: "reversed" })
    }
    if (isProduct && redeemableId) {
      await redeemables.updateRedeemables([{ id: redeemableId, status: "cancelled" }])
    }
    throw error
  }

  const { data: [seller] } = await query.graph({
    entity: "seller",
    fields: ["name", "handle"],
    filters: { id: sellerId },
  })
  try {
    await follows.createCustomerNotification({
      customer_id: recipient.id,
      kind: "tip_received",
      seller_id: sellerId,
      actor_label: seller?.name ?? "A store",
      actor_handle: seller?.handle ?? null,
      title: isCash ? "You received a thank-you" : "You received a store gift",
      body: isCash
        ? `${seller?.name ?? "A store"} sent you a ${Number(body.amount).toLocaleString("en-NG")} NGN wallet credit.`
        : isProduct
          ? `Your ${productTitle ?? "product"} gift is ready in Gift cards & passes.`
        : redeemableCode
          ? `${seller?.name ?? "A store"} sent you a redeemable code.`
          : `${seller?.name ?? "A store"} sent you ${body.product_title ?? "a product gift"}.`,
      payload: {
        tip_id: tip.id,
        amount: isCash ? Number(body.amount) : null,
        redeemable_code: redeemableCode,
        product_id: body.product_id ?? null,
        product_title: body.product_title ?? null,
      },
    })
  } catch {
    // Money and tip records are already settled. A notification retry can
    // happen independently without making the seller's gift fail.
  }

  res.json({ tip })
}
