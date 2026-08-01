// Deterministic seller-intelligence math. Every number here is computed in
// code from the seller's OWN data (orders, products, commission lines) — the
// LLM only narrates. Rules are cheap and repeatable; nothing is random.

export type BriefNumbers = {
  currency_code: string
  period: "daily" | "weekly"
  revenue: number
  commission: number
  net: number
  order_count: number
  margin_pct: number | null
  top_skus: { title: string; revenue: number; units: number }[]
  bottom_skus: { title: string; revenue: number; units: number }[]
  regions: { region: string; revenue: number; orders: number }[]
}

export type Opportunity = {
  action: string
  sku?: string
  impact: "high" | "medium" | "low"
  detail: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Orders come from getSellerOrders (id, total, status, items[], created_at).
// Commission lines come from getSellerCommissionLines (order_total, net_amount,
// commission_amount, currency_code, status, created_at).
export function computeBriefNumbers(input: {
  currency_code: string
  period: "daily" | "weekly"
  orders: any[]
  commissionLines: any[]
}): BriefNumbers {
  const { currency_code, period, orders, commissionLines } = input

  const activeOrders = orders.filter((o) => o.status !== "cancelled")
  const activeLines = commissionLines.filter(
    (l) => l.currency_code === currency_code && l.status !== "reversed"
  )

  const revenue = activeLines.reduce(
    (sum, l) => sum + Number(l.order_total ?? 0),
    0
  )
  const commission = activeLines.reduce(
    (sum, l) => sum + Number(l.commission_amount ?? 0),
    0
  )
  const net = activeLines.reduce((sum, l) => sum + Number(l.net_amount ?? 0), 0)

  // per-SKU revenue and units (guarded for seller orders without commission
  // lines yet — item totals are still informative)
  const skuMap = new Map<
    string,
    { title: string; revenue: number; units: number }
  >()
  for (const order of activeOrders) {
    for (const item of order.items ?? []) {
      const title = item?.title ?? "Untitled item"
      const units = Number(item?.quantity ?? 0)
      const itemTotal = Number(item?.total ?? item?.unit_price ?? 0) * Math.max(units, 1)
      const cur = skuMap.get(title) ?? { title, revenue: 0, units: 0 }
      cur.revenue = round2(cur.revenue + itemTotal)
      cur.units += units
      skuMap.set(title, cur)
    }
  }
  const skus = [...skuMap.values()].sort((a, b) => b.revenue - a.revenue)

  // region bucketing from the destination side of seller orders (best-effort:
  // order items carry region metadata when the marketplace tags it)
  const regionMap = new Map<string, { revenue: number; orders: number }>()
  for (const order of activeOrders) {
    const region = order.region_name ?? order.metadata?.region ?? "Unspecified"
    const cur = regionMap.get(region) ?? { revenue: 0, orders: 0 }
    cur.revenue = round2(cur.revenue + Number(order.total ?? 0))
    cur.orders += 1
    regionMap.set(region, cur)
  }
  const regions = [...regionMap.entries()]
    .map(([region, v]) => ({ region, ...v }))
    .sort((a, b) => b.revenue - a.revenue)

  return {
    currency_code,
    period,
    revenue: round2(revenue),
    commission: round2(commission),
    net: round2(net),
    order_count: activeOrders.length,
    margin_pct: revenue > 0 ? round2((net / revenue) * 100) : null,
    top_skus: skus.slice(0, 3),
    bottom_skus: skus.slice(-3).reverse(),
    regions,
  }
}

// Rule-based recommendations ranked by expected impact. Store-scoped input
// only — the caller guarantees the orders/products belong to one seller.
export function rankOpportunities(input: {
  numbers: BriefNumbers
  orders: any[]
  products: any[]
}): Opportunity[] {
  const opportunities: Opportunity[] = []
  const { numbers, orders, products } = input

  const soldTitles = new Set<string>()
  for (const order of orders) {
    for (const item of order.items ?? []) {
      if (item?.title) soldTitles.add(item.title)
    }
  }

  // 1. Price uplift on under-priced best sellers: a top SKU whose units are
  // high but revenue-per-unit is below the store average gets a nudge.
  const avgUnitRevenue =
    numbers.order_count > 0 && numbers.revenue > 0
      ? numbers.revenue / Math.max(numbers.order_count, 1)
      : 0
  const highVolume = numbers.top_skus.find((s) => s.units >= 2)
  if (highVolume && avgUnitRevenue > 0 && highVolume.revenue / highVolume.units < avgUnitRevenue * 0.8) {
    opportunities.push({
      action: "price_uplift",
      sku: highVolume.title,
      impact: "medium",
      detail: `"${highVolume.title}" sells well but below your average ticket — a modest price bump could lift margin.`,
    })
  }

  // 2. Bundle the top two movers.
  const [first, second] = numbers.top_skus
  if (first && second) {
    opportunities.push({
      action: "bundle",
      sku: `${first.title} + ${second.title}`,
      impact: "high",
      detail: `Bundle your two best sellers (${first.title}, ${second.title}) to raise basket size.`,
    })
  }

  // 3. Win-back on a listed product that hasn't sold in the period.
  const unsold = products.find((p) => {
    const title = p.title ?? p.id
    return !soldTitles.has(title)
  })
  if (unsold) {
    opportunities.push({
      action: "win_back",
      sku: unsold.title ?? unsold.id,
      impact: "low",
      detail: `Reach out to buyers of ${unsold.title ?? "this item"} — it hasn't sold in the period.`,
    })
  }

  // 4. Push a promo on the best seller if margin is healthy.
  if (first && numbers.margin_pct !== null && numbers.margin_pct >= 25) {
    opportunities.push({
      action: "promo",
      sku: first.title,
      impact: "medium",
      detail: `Healthy margin (${numbers.margin_pct}%) — a limited promo on ${first.title} could convert.`,
    })
  }

  const weight = { high: 3, medium: 2, low: 1 } as const
  return opportunities.sort(
    (a, b) => weight[b.impact] - weight[a.impact]
  )
}
