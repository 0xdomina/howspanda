import { z } from "zod"

// Buyer AI readers — grounded, read-only access to the marketplace catalog
// and reviews. Everything here returns REAL data (never model-generated), so
// the assistant's product facts, prices, and review scores can be tested
// deterministically and can never be hallucinated. The chat route runs these
// through the harness reader allowlist (ring 2) before invoking them.

export type Query = {
  graph: (config: any) => Promise<{ data: any[] }>
}

export type BuyerIntent =
  | "cart_add"
  | "cart_remove"
  | "price_compare"
  | "review_summary"
  | "product_search"
  | "general"

// ---- deterministic intent classifier -----------------------------------
//
// Keyword/pattern based so it is cheap, safe (no extra model call), and
// testable with the mock provider. Imperfect by design: a misclassification
// at worst triggers a read-only reader or falls back to a general chat turn —
// it can never mutate anything.

const CART_ADD_RE =
  /\b(add|put|buy|order|get|bag)\b.*\b(cart|basket)\b|add to cart/i
const CART_REMOVE_RE =
  /\b(remove|delete|take out|take off|drop)\b.*\b(cart|basket)\b|remove from cart/i
const PRICE_COMPARE_RE =
  /\b(compare|compare prices|cheaper|cheapest|which is cheaper|price of|how much does .* cost)\b/i
const REVIEW_RE =
  /\b(review|reviews|rating|ratings|what do people say|feedback|is it good|reputation)\b/i
const SEARCH_RE =
  /\b(find|show me|looking for|search|recommend|need|want|where can i|do you have)\b/i
const GENERAL_CHAT_RE = /\b(hello|hi|hey|thanks|thank you|how are you|bye|what is hows u|how do returns work|how do i pay|how does shipping|what are your hours)\b/i

export function classifyBuyerIntent(message: string): BuyerIntent {
  const text = message.trim()
  if (text.length < 3) return "general"

  if (CART_REMOVE_RE.test(text)) return "cart_remove"
  if (CART_ADD_RE.test(text)) return "cart_add"
  if (PRICE_COMPARE_RE.test(text)) return "price_compare"
  if (REVIEW_RE.test(text)) return "review_summary"
  if (GENERAL_CHAT_RE.test(text)) return "general"
  if (SEARCH_RE.test(text)) return "product_search"

  // A bare phrase with no general-chat marker is treated as a product query
  // ("ankara tote", "wireless earbuds under 20000") — the most useful default
  // for a shopping assistant and still read-only.
  if (!/[?]/.test(text)) return "product_search"

  return "general"
}

// ---- search results shape (shared by search + price compare) -----------

export const BuyerProductSchema = z.object({
  product_id: z.string(),
  title: z.string(),
  handle: z.string().nullable(),
  thumbnail: z.string().nullable(),
  min_price: z.number().nullable(),
  max_price: z.number().nullable(),
  currency_code: z.string().nullable(),
  seller_name: z.string().nullable(),
  variant_count: z.number(),
  best_variant_id: z.string().nullable(),
})

export type BuyerProduct = z.infer<typeof BuyerProductSchema>

export const BuyerSearchResultSchema = z.object({
  query: z.string(),
  products: z.array(BuyerProductSchema).max(6),
})

export type BuyerSearchResult = z.infer<typeof BuyerSearchResultSchema>

// Intent/function words stripped before catalog matching so a natural-language
// shopping phrase ("find me a tote", "add the tote to my cart", "what do people
// say about the scarf") still resolves to its significant product terms.
const SEARCH_STOPWORDS = new Set([
  "add", "remove", "delete", "take", "drop", "put", "get", "bag", "buy", "order",
  "cart", "basket",
  "find", "show", "looking", "search", "recommend", "need", "want", "where",
  "compare", "comparison", "cheaper", "cheapest", "price", "prices", "cost",
  "review", "reviews", "rating", "ratings", "feedback", "say", "says", "people",
  "good", "bad", "is", "are", "it", "its", "this", "that", "the", "a", "an",
  "and", "for", "with", "of", "in", "on", "to", "from", "about", "please",
  "what", "which", "how", "much", "does", "do", "me", "you", "your", "my", "i",
  "can", "hi", "hello", "hey", "thanks", "thank",
])

// Extract the significant terms from a natural-language query. The result is
// the "shopping intent" minus its scaffolding — what's left is what the buyer
// is actually looking for.
function extractSearchTerms(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !SEARCH_STOPWORDS.has(t))
}

/**
 * Search the published catalog by keyword. Prices are the min/max across all
 * the product's variants (currency of the cheapest price). Never returns
 * draft/archived products. The query is matched after stripping stopwords, so
 * conversational phrasing still resolves to the product the buyer means.
 */
export async function searchCatalog(
  query: Query,
  keyword: string,
  limit = 6
): Promise<BuyerSearchResult> {
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "thumbnail",
      "status",
      "variants.id",
      "variants.title",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "seller.name",
    ],
  })

  const terms = extractSearchTerms(keyword)
  const published = (products ?? []).filter((p) => p.status === "published")
  const matches = terms.length
    ? published.filter((p) => {
        const hay = `${p.title ?? ""} ${p.handle ?? ""}`.toLowerCase()
        return terms.every((t) => hay.includes(t))
      })
    : published

  return {
    query: keyword,
    products: matches.slice(0, limit).map((p) => {
      const amounts = (p.variants ?? [])
        .flatMap((v: any) =>
          (v.prices ?? []).map((pr: any) => ({
            amount: Number(pr.amount),
            currency_code: pr.currency_code as string | null,
          }))
        )
        .filter((x: any) => Number.isFinite(x.amount))

      const sorted = amounts.sort((a: any, b: any) => a.amount - b.amount)
      const best = amounts.length
        ? amounts.reduce((a: any, b: any) => (a.amount < b.amount ? a : b))
        : null

      return {
        product_id: p.id,
        title: p.title,
        handle: p.handle ?? null,
        thumbnail: p.thumbnail ?? null,
        min_price: sorted[0]?.amount ?? null,
        max_price: sorted[sorted.length - 1]?.amount ?? null,
        currency_code: best?.currency_code ?? null,
        seller_name: p.seller?.name ?? null,
        variant_count: (p.variants ?? []).length,
        best_variant_id: best ? p.variants[0]?.id ?? null : null,
      }
    }),
  }
}

// ---- review summary -----------------------------------------------------

export const BuyerReviewSummarySchema = z.object({
  product_id: z.string(),
  product_title: z.string().nullable(),
  average_rating: z.number(),
  review_count: z.number(),
  recent_comments: z.array(
    z.object({
      rating: z.number(),
      comment: z.string().nullable(),
    })
  ),
})

export type BuyerReviewSummary = z.infer<typeof BuyerReviewSummarySchema>

type ReviewsService = {
  getProductRatingAggregate: (
    productId: string
  ) => Promise<{ average: number; count: number }>
  listProductRatings: (filters: any, config?: any) => Promise<any[]>
}

export type { ReviewsService }

/**
 * Aggregate rating + a few recent published comments for one product. Only
 * ratings on still-published reviews count (same rule as the storefront
 * product page).
 */
export async function getReviewSummary(
  reviews: ReviewsService,
  product: BuyerProduct
): Promise<BuyerReviewSummary> {
  const aggregate = await reviews.getProductRatingAggregate(product.product_id)
  const ratings = await reviews.listProductRatings(
    { product_id: product.product_id },
    {
      relations: ["review"],
      order: { created_at: "DESC" },
      take: 4,
    }
  )

  const comments = ratings
    .filter(
      (r) => r.review?.status === "published" && r.review?.comment != null
    )
    .map((r) => ({ rating: r.rating, comment: r.review!.comment }))

  return {
    product_id: product.product_id,
    product_title: product.title,
    average_rating: aggregate.average,
    review_count: aggregate.count,
    recent_comments: comments,
  }
}

// ---- cart proposal ------------------------------------------------------

export const CartProposalSchema = z.object({
  action: z.enum(["add", "remove"]),
  variant_id: z.string().nullable(),
  line_item_id: z.string().nullable(),
  quantity: z.number().int().min(1).max(99),
  title: z.string(),
  price: z.number().nullable(),
  currency_code: z.string().nullable(),
})

export type CartProposal = z.infer<typeof CartProposalSchema>

/**
 * Build a cart proposal from the best-matching product in the real catalog.
 * This is a PROPOSAL only — the route returns it to the buyer, who approves it
 * in the UI before the frontend calls the existing add/remove cart actions.
 * The AI itself never touches the cart module.
 */
export async function proposeCartAction(
  query: Query,
  intent: BuyerIntent,
  keyword: string
): Promise<CartProposal | null> {
  const search = await searchCatalog(query, keyword, 1)
  const product = search.products[0]
  if (!product) {
    return null
  }

  if (intent === "cart_remove") {
    return {
      action: "remove",
      variant_id: product.best_variant_id,
      line_item_id: null, // frontend resolves the actual line from the cart
      quantity: 1,
      title: product.title,
      price: product.min_price,
      currency_code: product.currency_code,
    }
  }

  return {
    action: "add",
    variant_id: product.best_variant_id,
    line_item_id: null,
    quantity: 1,
    title: product.title,
    price: product.min_price,
    currency_code: product.currency_code,
  }
}
