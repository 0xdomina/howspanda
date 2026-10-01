import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { randomUUID } from "node:crypto"
import { NIMIQ_MODULE } from "../../../../modules/nimiq"
import type NimiqModuleService from "../../../../modules/nimiq/service"
import {
  merchantFor,
  ngnMinorToUsdtBase,
  usdtNgnRate,
} from "../../../../modules/nimiq/service"
import { resolveDelivery } from "../../../../lib/delivery/resolve"

const QUOTE_TTL_MIN_DEFAULT = 10

// Priced payment quote from a real Medusa cart. Totals come from live catalog
// prices + delivery resolution — never from client-sent amounts. Email is
// optional (wallet-native buyers); the signer binds at verify time.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as {
    cart_id?: string
    buyer_email?: string
    token?: string
  }
  if (!body.cart_id) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cart needed")
  }
  if (body.token !== "USDT") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "USDT only for now"
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [cart] } = (await query.graph({
    entity: "cart",
    fields: [
      "id",
      "email",
      "completed_at",
      "items.id",
      "items.quantity",
      "items.variant.id",
      "items.variant.prices.amount",
      "items.variant.prices.currency_code",
      "items.product.id",
      "items.product.title",
      "items.product.status",
      "items.product.metadata",
      "items.product.seller.id",
      "items.product.seller.delivery_fee",
      "items.product.seller.free_delivery",
    ],
    filters: { id: [body.cart_id] },
  })) as { data: any[] }
  if (!cart || cart.completed_at) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cart unavailable")
  }
  const cartItems = (cart.items ?? []) as any[]
  if (!cartItems.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cart is empty")
  }

  let ngnMinor = 0
  const lines: {
    product_id: string
    variant_id: string
    title: string
    quantity: number
    unit_minor: number
    delivery_mode: string
    delivery_fee_minor: number
  }[] = []
  for (const item of cartItems) {
    const variant = item.variant
    const price = (variant?.prices ?? []).find(
      (p: any) => (p.currency_code ?? "ngn").toLowerCase() === "ngn"
    )
    const unit = Number(price?.amount)
    const product = item.product
    if (!product || product.status !== "published" || !Number.isFinite(unit) || unit <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "An item is unavailable"
      )
    }
    ngnMinor += Math.round(unit) * Number(item.quantity || 1)
    const delivery = resolveDelivery(product.metadata, product.seller)
    lines.push({
      product_id: product.id,
      variant_id: variant?.id,
      title: product.title,
      quantity: Number(item.quantity || 1),
      unit_minor: Math.round(unit),
      delivery_mode: delivery.mode,
      delivery_fee_minor: delivery.fee,
    })
    if (delivery.mode === "fixed") ngnMinor += delivery.fee
  }

  const sellerIds = new Set(
    cartItems.map((i: any) => i?.product?.seller?.id).filter(Boolean)
  )
  if (sellerIds.size !== 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "One store per payment"
    )
  }

  const email = (body.buyer_email ?? cart.email ?? "").trim().toLowerCase() || null
  const rate = await usdtNgnRate()
  const merchant = merchantFor("USDT")
  const ttlMin = Number(process.env.NIMIQ_QUOTE_TTL_MIN) || QUOTE_TTL_MIN_DEFAULT
  const nimiq: NimiqModuleService = req.scope.resolve(NIMIQ_MODULE)
  const reference = `HYS-NIM-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`
  const quote = await nimiq.persistQuote({
    buyerEmail: email,
    cartId: cart.id,
    token: "USDT",
    network: "polygon",
    amountTokenBase: await ngnMinorToUsdtBase(ngnMinor),
    amountNgnMinor: ngnMinor,
    merchantAddress: merchant,
    reference,
    items: lines,
    expiresAt: new Date(Date.now() + ttlMin * 60 * 1000),
  })

  res.status(201).json({
    quote_id: quote.id,
    reference,
    token: "USDT",
    network: "polygon",
    amount_token_base: (quote as any).amount_token_base?.toString() ?? null,
    amount_ngn_minor: ngnMinor,
    usdt_ngn_rate: rate,
    merchant_address: merchant,
    expires_at: (quote as any).expires_at,
    lines,
  })
}
