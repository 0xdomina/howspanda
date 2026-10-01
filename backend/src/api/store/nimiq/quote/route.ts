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

type QuoteItem = { product_id: string; variant_id: string; quantity: number }

const QUOTE_TTL_MIN_DEFAULT = 10

// Priced payment quote for Nimiq Pay wallets. Totals come from live catalog
// prices + delivery resolution — never from client-sent amounts.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as {
    buyer_email?: string
    token?: string
    items?: QuoteItem[]
  }
  const email = (body.buyer_email ?? "").trim().toLowerCase()
  if (!email || !email.includes("@")) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Buyer email needed")
  }
  if (body.token !== "USDT") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "USDT only for now"
    )
  }
  const items = (body.items ?? []).filter(
    (i) => i?.product_id && i?.variant_id && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 10
  )
  if (!items.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Quote needs items")
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = (await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "status",
      "metadata",
      "variants.id",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "seller.id",
      "seller.delivery_fee",
      "seller.free_delivery",
    ],
    filters: { id: items.map((i) => i.product_id) },
  })) as { data: any[] }
  const byId = new Map((products ?? []).map((p: any) => [p.id, p]))

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
  for (const item of items) {
    const product = byId.get(item.product_id)
    const variant = (product?.variants ?? []).find((v: any) => v.id === item.variant_id)
    const price = (variant?.prices ?? []).find(
      (p: any) => (p.currency_code ?? "ngn").toLowerCase() === "ngn"
    )
    const unit = Number(price?.amount)
    if (!product || product.status !== "published" || !Number.isFinite(unit) || unit <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "An item is unavailable"
      )
    }
    ngnMinor += Math.round(unit) * item.quantity
    const delivery = resolveDelivery(product.metadata, product.seller)
    lines.push({
      product_id: product.id,
      variant_id: variant.id,
      title: product.title,
      quantity: item.quantity,
      unit_minor: Math.round(unit),
      delivery_mode: delivery.mode,
      delivery_fee_minor: delivery.fee,
    })
    if (delivery.mode === "fixed") ngnMinor += delivery.fee
  }

  // One seller per quote (bank-transfer parity; multi-seller carts split later).
  const sellerIds = new Set(
    lines.map((l) => (byId.get(l.product_id) as any)?.seller?.id).filter(Boolean)
  )
  if (sellerIds.size !== 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "One store per payment"
    )
  }

  const rate = usdtNgnRate()
  const merchant = merchantFor("USDT")
  const ttlMin = Number(process.env.NIMIQ_QUOTE_TTL_MIN) || QUOTE_TTL_MIN_DEFAULT
  const nimiq: NimiqModuleService = req.scope.resolve(NIMIQ_MODULE)
  const reference = `HYS-NIM-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`
  const quote = await nimiq.persistQuote({
    buyerEmail: email,
    token: "USDT",
    network: "polygon",
    amountTokenBase: ngnMinorToUsdtBase(ngnMinor),
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
    amount_token_base: quote.amount_token_base?.toString() ?? null,
    amount_ngn_minor: ngnMinor,
    usdt_ngn_rate: rate,
    merchant_address: merchant,
    expires_at: quote.expires_at,
    lines,
  })
}
