import {
  getSellerOrders,
  getSellerProducts,
  getSellerCommissionLines,
  SellerIdentity,
} from "./seller-context"
import { computeBriefNumbers, rankOpportunities, BriefNumbers, Opportunity } from "./store-analytics"

type Query = {
  graph: (config: any) => Promise<{ data: any[] }>
}

export type SellerAnalytics = {
  orders: any[]
  commissionLines: any[]
  products: any[]
  numbers: BriefNumbers
  opportunities: Opportunity[]
}

/**
 * Build the deterministic analytics surface for ONE seller. Every query is
 * seller-scoped (getSellerOrders/Products/CommissionLines filter strictly by
 * seller id), so recommendations are provably scoped to the requesting store.
 */
export async function buildSellerAnalytics(input: {
  query: Query
  seller: SellerIdentity
  period: "daily" | "weekly"
  currencyCode?: string
}): Promise<SellerAnalytics> {
  const { query, seller, period } = input
  const currencyCode = input.currencyCode ?? "ngn"

  const [orders, products, commissionLines] = await Promise.all([
    getSellerOrders(query, seller.seller_id),
    getSellerProducts(query, seller.seller_id),
    getSellerCommissionLines(query, seller.seller_id),
  ])

  const numbers = computeBriefNumbers({
    currency_code: currencyCode,
    period,
    orders,
    commissionLines,
  })
  const opportunities = rankOpportunities({ numbers, orders, products })

  return { orders, commissionLines, products, numbers, opportunities }
}
