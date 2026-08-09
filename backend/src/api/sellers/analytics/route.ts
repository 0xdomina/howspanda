import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import type MarketplaceModuleService from "../../../modules/marketplace/service"
import { requireSellerPermission } from "../../../lib/sellers/resolve-seller"

type Bucket = { label: string; gross: number; net: number; orders: number }

const DAY = 24 * 60 * 60 * 1000
const inNg = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`

function dailySeries(lines: any[]): Bucket[] {
  const byDay = new Map<string, Bucket>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY)
    byDay.set(inNg(d), { label: inNg(d), gross: 0, net: 0, orders: 0 })
  }
  for (const l of lines) {
    const key = inNg(new Date(l.created_at))
    const b = byDay.get(key)
    if (!b) continue
    b.gross += Number(l.order_total)
    b.net += Number(l.net_amount)
    b.orders += 1
  }
  return [...byDay.values()]
}

function weekStart(d: Date): string {
  const copy = new Date(d)
  const day = (copy.getUTCDay() + 6) % 7 // Monday-first
  copy.setUTCDate(copy.getUTCDate() - day)
  return inNg(copy)
}

function weeklySeries(lines: any[]): Bucket[] {
  const byWeek = new Map<string, Bucket>()
  for (let i = 7; i >= 0; i--) {
    const d = new Date(Date.now() - i * 7 * DAY)
    const key = weekStart(d)
    if (!byWeek.has(key)) {
      byWeek.set(key, { label: key, gross: 0, net: 0, orders: 0 })
    }
  }
  for (const l of lines) {
    const key = weekStart(new Date(l.created_at))
    const b = byWeek.get(key)
    if (!b) continue
    b.gross += Number(l.order_total)
    b.net += Number(l.net_amount)
    b.orders += 1
  }
  return [...byWeek.values()]
}

function monthlySeriesOf(lines: any[]): Bucket[] {
  const byMonth = new Map<string, Bucket>()
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    byMonth.set(key, { label: key, gross: 0, net: 0, orders: 0 })
  }
  for (const l of lines) {
    const d = new Date(l.created_at)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    const b = byMonth.get(key)
    if (!b) continue
    b.gross += Number(l.order_total)
    b.net += Number(l.net_amount)
    b.orders += 1
  }
  return [...byMonth.values()]
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await requireSellerPermission(req, "analytics")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: [
      "seller.id",
      "seller.name",
      "seller.products.id",
      "seller.products.title",
      "seller.products.thumbnail",
      "seller.products.status",
      "seller.orders.id",
    ],
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

  const sellerId = sellerAdmin.seller.id
  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)

  const [commission, ordersPayload] = await Promise.all([
    marketplace.listCommissionLines({ seller_id: sellerId }, { take: null }),
    (async () => {
      const orderIds = (sellerAdmin.seller.orders ?? []).map((o: any) => o.id)
      if (!orderIds.length) {
        return { result: { rows: [] as any[], total: 0 } }
      }
      return getOrdersListWorkflow(req.scope).run({
        input: {
          fields: [
            "id",
            "created_at",
            "items.*",
            "items.variant",
            "items.variant.product",
          ],
          variables: { filters: { id: orderIds } },
        },
      })
    })(),
  ])

  const lines = (commission ?? []).filter(
    (l: any) => l.status !== "reversed"
  )

  // Overview per currency.
  const overview: Record<string, { gross: number; commission: number; net: number; orders: number }> = {}
  for (const l of lines) {
    const cc = l.currency_code ?? "ngn"
    const o = (overview[cc] ??= {
      gross: 0,
      commission: 0,
      net: 0,
      orders: 0,
    })
    o.gross += Number(l.order_total)
    o.commission += Number(l.commission_amount)
    o.net += Number(l.net_amount)
    o.orders += 1
  }

  const ngnLines = lines.filter((l) => l.currency_code === "ngn")
  const series = {
    daily: dailySeries(ngnLines),
    weekly: weeklySeries(ngnLines),
    monthly: monthlySeriesOf(ngnLines),
  }

  // Product performance from order line items, merged over the catalog so
  // zero-sale ("not selling") products surface too.
  const orderRows = Array.isArray(ordersPayload.result)
    ? ordersPayload.result
    : ordersPayload.result.rows ?? []
  const byProduct = new Map<string, { units: number; revenue: number; last_sold: string | null }>()
  for (const order of orderRows) {
    const created = order.created_at ?? null
    for (const item of order.items ?? []) {
      const pid = item.product_id ?? item.variant?.product_id
      if (!pid) continue
      let agg = byProduct.get(pid)
      if (!agg) {
        agg = { units: 0, revenue: 0, last_sold: null }
        byProduct.set(pid, agg)
      }
      agg.units += Number(item.quantity ?? 0)
      const unitRevenue =
        Number(item.subtotal ?? 0) ||
        Number(item.unit_price ?? 0) * Math.max(1, Number(item.quantity ?? 1))
      agg.revenue += unitRevenue
      if (created && (!agg.last_sold || created > agg.last_sold)) {
        agg.last_sold = created
      }
    }
  }

  const catalog = (sellerAdmin.seller.products ?? []) as any[]
  let products = catalog.map((p: any) => {
    const agg = byProduct.get(p.id)
    return {
      product_id: p.id,
      title: p.title ?? "Untitled product",
      thumbnail: p.thumbnail ?? null,
      status: p.status ?? "draft",
      units: agg?.units ?? 0,
      revenue: agg?.revenue ?? 0,
      last_sold: agg?.last_sold ?? null,
    }
  })
  // Any product sold but missing from the (batch-)selected catalog.
  for (const [pid, agg] of byProduct) {
    if (!products.some((p) => p.product_id === pid)) {
      products.push({
        product_id: pid,
        title: "Sold product",
        thumbnail: null,
        status: "published",
        units: agg.units,
        revenue: agg.revenue,
        last_sold: agg.last_sold,
      })
    }
  }
  products.sort(
    (a, b) => Number(b.revenue) - Number(a.revenue) || b.product_id.localeCompare(a.product_id)
  )

  const journal = [...lines]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 50)
    .map((l) => ({
      id: l.id,
      order_id: l.order_id,
      currency_code: l.currency_code ?? "ngn",
      gross: Number(l.order_total),
      commission: Number(l.commission_amount),
      net: Number(l.net_amount),
      status: l.status,
      created_at: l.created_at,
    }))

  res.json({
    overview,
    series,
    products,
    journal,
  })
}
