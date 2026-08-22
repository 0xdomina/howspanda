import { registerCapability } from "../harness"
import {
  assertCapabilityAllowed,
  assertReaderAllowed,
  validateStructuredOutput,
} from "../harness"
import { registerMockOutput } from "../model"
import {
  BuyerReviewSummarySchema,
  BuyerSearchResultSchema,
  CartProposalSchema,
  getReviewSummary,
  proposeCartAction,
  searchCatalog,
  type BuyerIntent,
  type BuyerProduct,
  type BuyerSearchResult,
  type BuyerReviewSummary,
  type CartProposal,
  type Query,
  type ReviewsService,
} from "../buyer-context"

// Buyer AI capabilities — registered once at module load so the harness
// allowlist and the deterministic mock stay in sync.
//
// All of them are READ-ONLY except buyer_cart_proposal, which is marked
// sideEffects: "proposal": the route returns the proposed action to the buyer
// and the buyer approves it in the UI before the frontend mutates the cart.
// The AI itself never calls a cart mutation.

registerCapability({
  key: "buyer_search",
  actor: "buyer",
  label: "Search the marketplace catalog",
  readers: ["catalog"],
  sideEffects: "none",
  schema: BuyerSearchResultSchema,
})

registerCapability({
  key: "buyer_price_compare",
  actor: "buyer",
  label: "Compare prices across catalog products",
  readers: ["catalog"],
  sideEffects: "none",
  schema: BuyerSearchResultSchema,
})

registerCapability({
  key: "buyer_review_summary",
  actor: "buyer",
  label: "Summarize product reviews",
  readers: ["catalog", "reviews"],
  sideEffects: "none",
  schema: BuyerReviewSummarySchema,
})

registerCapability({
  key: "buyer_cart_proposal",
  actor: "buyer",
  label: "Propose a cart action (buyer approval required)",
  readers: ["catalog"],
  sideEffects: "proposal",
  schema: CartProposalSchema,
})

// Deterministic mock narration for each capability (the structured `result`
// is code-generated and schema-validated; the mock only supplies the prose).
registerMockOutput(
  "buyer_search",
  "Here are products that match your search."
)
registerMockOutput(
  "buyer_price_compare",
  "Here’s a quick price comparison for the matching products."
)
registerMockOutput(
  "buyer_review_summary",
  "Here’s a quick summary of the buyer reviews for this product."
)
registerMockOutput(
  "buyer_cart_proposal",
  "I can update your cart. Please confirm the change below."
)

// ---- capability runner --------------------------------------------------

export type BuyerCapabilityOutcome =
  | {
      capability: "buyer_search" | "buyer_price_compare"
      result: BuyerSearchResult
      proposal?: undefined
    }
  | {
      capability: "buyer_review_summary"
      result: BuyerReviewSummary
      proposal?: undefined
    }
  | {
      capability: "buyer_cart_proposal"
      result: CartProposal
      proposal: CartProposal
    }

/**
 * Run a buyer capability and return its deterministic result. The caller
 * (chat route) supplies the reader services; this function owns the harness
 * allowlist gates and validates the structured output against the declared
 * schema before anything is returned.
 */
export async function runBuyerCapability(
  key: string,
  intent: BuyerIntent,
  keyword: string,
  services: { query: Query; reviews?: ReviewsService }
): Promise<BuyerCapabilityOutcome> {
  // Ring 1 — the capability must be registered for buyer actors.
  const spec = assertCapabilityAllowed(key, "buyer")

  switch (key) {
    case "buyer_search":
    case "buyer_price_compare": {
      assertReaderAllowed(spec, "catalog")
      const result = await searchCatalog(services.query, keyword)
      return { capability: key, result: validateStructuredOutput(spec, result) }
    }

    case "buyer_review_summary": {
      if (!services.reviews) {
        throw new Error("buyer_review_summary requires the reviews service")
      }
      assertReaderAllowed(spec, "catalog")
      const search = await searchCatalog(services.query, keyword, 1)
      const product: BuyerProduct | undefined = search.products[0]
      if (!product) {
        throw new Error("No catalog product matches this request")
      }
      assertReaderAllowed(spec, "reviews")
      const result = await getReviewSummary(services.reviews, product)
      return {
        capability: key,
        result: validateStructuredOutput(spec, result),
      }
    }

    case "buyer_cart_proposal": {
      assertReaderAllowed(spec, "catalog")
      const proposal = await proposeCartAction(services.query, intent, keyword)
      if (!proposal) {
        throw new Error("No catalog product matches this cart request")
      }
      return {
        capability: key,
        result: validateStructuredOutput(spec, proposal),
        proposal: validateStructuredOutput(spec, proposal),
      }
    }

    default:
      throw new Error(`Unknown buyer capability "${key}"`)
  }
}
