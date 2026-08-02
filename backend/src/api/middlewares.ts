import {
  defineMiddlewares,
  authenticate,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { rateLimit } from "../lib/security/rate-limit"
import { PostSellerCreateSchema } from "./sellers/route"

// Abuse-throttling for sensitive routes. Keyed by identity where the request
// body already carries the actor's email (so NAT'd users behind one IP are not
// throttled together); otherwise keyed by IP. See lib/security/rate-limit.ts.
const OTP_RATE_LIMIT = rateLimit({
  name: "otp",
  limit: 20,
  windowMs: 60 * 60 * 1000,
  keyOf: (req) => {
    const b = req.body as { email?: string; phone?: string } | undefined
    return b?.email || b?.phone
  },
})
const REFERRAL_RATE_LIMIT = rateLimit({
  name: "referral",
  limit: 30,
  windowMs: 60 * 60 * 1000,
  keyOf: (req) => {
    const b = req.body as { email?: string } | undefined
    return b?.email
  },
})
const WALLET_RATE_LIMIT = rateLimit({
  name: "wallet",
  limit: 20,
  windowMs: 60 * 60 * 1000,
  keyOf: (req) => {
    const b = req.body as { buyerEmail?: string } | undefined
    return b?.buyerEmail
  },
})
const CHECKOUT_RATE_LIMIT = rateLimit({
  name: "checkout",
  limit: 60,
  windowMs: 15 * 60 * 1000,
})
const ADMIN_RATE_LIMIT = rateLimit({
  name: "admin",
  limit: 120,
  windowMs: 60 * 1000,
})
// Credential endpoints (login/register/update/reset) are the brute-force
// surface; key by the identifier in the body when present, else IP. MFA/session
// routes are exempt — they're part of the normal authenticated flow.
const AUTH_RATE_LIMIT = rateLimit({
  name: "auth",
  limit: 20,
  windowMs: 15 * 60 * 1000,
  keyOf: (req) => {
    const b = req.body as
      | { email?: string; phone?: string; identifier?: string }
      | undefined
    return b?.email || b?.phone || b?.identifier
  },
})

export const PostAiListingSchema = z.object({
  notes: z.string().min(3),
  category: z.string().optional(),
})

// Mobile-first listing: photo + price + short description. The route maps
// this minimal shape onto the full product create payload (default "One Size"
// option/variant, published, no inventory tracking). Full admin shape stays
// supported unchanged (options/variants supplied). Each variant may carry an
// optional `stock` (quantity to sell); the workflow turns it into a real
// inventory level at the store's default location.
export const PostSellerMobileProductSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().max(500).optional(),
  price: z.number().positive().optional(),
  photo: z.string().url().optional(),
  // Quantity to sell for a single-option product (maps onto the default
  // "One Size" variant's inventory level).
  stock: z.number().int().min(0).optional(),
  currency_code: z
    .string()
    .default("ngn")
    .transform((c) => c.toLowerCase()),
  status: z.enum(["draft", "published"]).optional(),
  handle: z.string().optional(),
  images: z.array(z.object({ url: z.string().url() })).optional(),
  options: z
    .array(
      z.object({
        title: z.string().min(1),
        values: z.array(z.string().min(1)).min(1),
      })
    )
    .optional(),
  variants: z
    .array(
      z.object({
        title: z.string().optional(),
        options: z.record(z.string(), z.string()).optional(),
        prices: z
          .array(
            z.object({
              currency_code: z.string(),
              amount: z.number(),
            })
          )
          .optional(),
        sku: z.string().optional(),
        stock: z.number().int().min(0).optional(),
        manage_inventory: z.boolean().optional(),
      })
    )
    .optional(),
})

// Update an existing seller product: base fields + per-variant price/stock.
// Variants are matched by id (already created); price/stock are both optional
// so a seller can reprice or restock independently.
export const PatchSellerMobileProductSchema = z.strictObject({
  title: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
  photo: z.string().url().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  variants: z
    .array(
      z.object({
        id: z.string().min(1),
        price: z.number().positive().optional(),
        stock: z.number().int().min(0).optional(),
      })
    )
    .optional(),
})

export const PostAiPricingSchema = z.object({
  title: z.string().min(2),
  category: z.string().optional(),
  cost: z.number().positive().optional(),
  currency_code: z
    .string()
    .default("ngn")
    .transform((c) => c.toLowerCase()),
})

export const PostAiInsightsSchema = z.object({
  question: z.string().min(3),
})

export const PostAiAccountingSchema = z.object({})

export const PostAiMarketingSchema = z.object({
  goal: z.string().optional(),
  tone: z.string().optional(),
})

export const PostAiBriefSchema = z.object({
  period: z.enum(["daily", "weekly"]).default("daily"),
})

export const PostAiRecommendationsSchema = z.object({
  period: z.enum(["daily", "weekly"]).default("daily"),
})

export const PostPayoutAccountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bank_account"),
    bank_code: z.string().min(3),
    account_name: z.string().min(2),
    account_number: z.string().regex(/^\d{10}$/, "NUBAN is 10 digits"),
  }),
  z.object({
    type: z.literal("crypto_address"),
    network: z.enum(["base", "solana"]),
    address: z.string().min(10),
  }),
])

export const PostSellerPayoutSchema = z.object({
  rail: z.enum(["paystack", "crypto-usdc"]),
  idempotency_key: z.string().optional(),
})

// Buyer wallet withdrawal (Phase 15): email is the ownership proof, mirroring
// the store wallet credit routes (mall prizes, delivery payouts).
export const PostWalletWithdrawalAccountSchema = z.object({
  buyerEmail: z.string().email(),
  type: z.enum(["bank_account", "crypto_address"]),
  bank_code: z.string().min(3).optional(),
  account_number: z.string().regex(/^\d{10}$/, "NUBAN is 10 digits").optional(),
  network: z.enum(["base", "solana"]).optional(),
  address: z.string().min(10).optional(),
})

export const PostWalletWithdrawalSchema = z.object({
  buyerEmail: z.string().email(),
  rail: z.enum(["paystack", "crypto-usdc"]),
  amount: z.number().positive(),
  idempotency_key: z.string().optional(),
})

// Buyer escrow actions (guest checkout): email is the ownership proof
export const PostConfirmReceiptSchema = z.object({
  email: z.string().email(),
})

export const PostRequestReturnSchema = z.object({
  email: z.string().email(),
  reason: z.string().min(3),
})

export const PostCancelReturnSchema = z.object({
  email: z.string().email(),
})

// Admin escrow intervention
export const PostEscrowHoldSchema = z.object({
  order_id: z.string().min(1),
  reason: z.string().min(3),
})

export const PostEscrowReleaseSchema = z.object({
  order_id: z.string().min(1),
  release_now: z.boolean().optional(),
})

// Redeemables (Phase 7): per-type field rules are enforced in the service
export const PostSellerRedeemableSchema = z.object({
  type: z.enum(["gift_card", "voucher", "ticket"]),
  title: z.string().min(2),
  face_value: z.number().positive().optional(),
  discount_type: z.enum(["fixed", "percent"]).optional(),
  discount_value: z.number().positive().optional(),
  price: z.number().positive().optional(),
  expires_at: z.coerce.date().optional(),
  quantity: z.number().int().min(1).max(100).default(1),
  issued_to_email: z.string().email().optional(),
})

export const PostRedeemInStoreSchema = z.object({
  code: z.string().min(6),
  amount: z.number().positive().optional(),
})

export const PostApplyRedeemableSchema = z.object({
  code: z.string().min(6),
})

// Reviews (Phase 8): email is the ownership proof (Phase 6 pattern)
export const PostCreateReviewSchema = z.object({
  email: z.string().email(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  product_ratings: z
    .array(
      z.object({
        product_id: z.string().min(1),
        rating: z.number().int().min(1).max(5),
      })
    )
    .optional(),
})

export const PostEditReviewSchema = z
  .object({
    email: z.string().email(),
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().max(2000).nullable().optional(),
  })
  .refine((b) => b.rating !== undefined || b.comment !== undefined, {
    message: "Provide a new rating or comment",
  })

export const DeleteReviewSchema = z.object({
  email: z.string().email(),
})

export const PostReviewReplySchema = z.object({
  body: z.string().min(1).max(2000),
})

export const PostRemoveReviewSchema = z.object({
  reason: z.string().min(3),
})

// Tipping (Phase 8)
export const PostBuyerTipSchema = z.object({
  email: z.string().email(),
  amount: z.number().positive(),
  note: z.string().max(500).optional(),
})

export const PostSellerTipSchema = z.object({
  buyer_email: z.string().email(),
  amount: z.number().positive().optional(),
  product_id: z.string().min(1).optional(),
  product_title: z.string().min(1).optional(),
  redeemable_code: z.string().min(6).optional(),
  order_id: z.string().min(1).optional(),
  note: z.string().max(500).optional(),
})

// Growth (Phase 9): referrals
export const PostReferralCreateSchema = z.object({
  referee_email: z.string().email(),
})

export const PostReferralClaimSchema = z.object({
  code: z.string().min(1),
  email: z.string().email(),
})

// Malls (Phase 10)
export const PostMallCreateSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(500).optional(),
  targetSellers: z.number().int().min(2).optional(),
  targetBuyers: z.number().int().min(2).optional(),
  prizeWinnerCount: z.number().int().min(1),
  prizeDistribution: z.enum(["equal", "random"]),
  prizePoolNgn: z.number().positive(),
  durationDays: z.number().int().min(1).max(30).optional(),
})

export const PostMallJoinSchema = z.object({
  contributionNgn: z.number().positive(),
  redeemableId: z.string().min(1).optional(),
})

export const PostMallJoinBuyerSchema = z.object({
  buyerEmail: z.string().email(),
})

export const PostMallPurchaseSchema = z.object({
  buyerEmail: z.string().email(),
  orderId: z.string().min(1),
})

// Delivery (Phase 11): email is the identity for couriers/recipients
export const PostDeliveryJobSchema = z.object({
  orderId: z.string().min(1).optional(),
  packageDescription: z.string().min(3),
  packageWeight: z.string().optional(),
  pickupAddress: z.string().min(3),
  destinationAddress: z.string().min(3),
  destinationPhone: z.string().optional(),
  postedPrice: z.number().positive(),
})

export const PostDeliveryOfferSchema = z.object({
  courierEmail: z.string().email(),
  offeredPrice: z.number().positive(),
})

export const PostDeliveryPickupSchema = z.object({
  courierEmail: z.string().email(),
})

export const PostDeliveryCancelSchema = z.object({
  email: z.string().email(),
  reason: z.string().min(3),
})

export const PostDeliveryConfirmSchema = z.object({
  recipientEmail: z.string().email(),
  courierEmail: z.string().email().optional(),
})

// Chat + POD verification (Phase 12)
export const PostDeliveryChatSchema = z.object({
  senderEmail: z.string().email(),
  body: z.string().min(1).max(2000),
})

export const PostDeliveryVerifyGenerateSchema = z.object({
  courierEmail: z.string().email(),
})

export const PostDeliveryVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "Code is 6 digits"),
  purpose: z.enum(["pickup", "delivery"]),
})

// KYC (Phase 14): identity ladder keyed by the signup identifier (email OR
// phone). The signup identifier is already verified; `destination` carries
// the complementary identifier being verified during KYC.
export const PostKycRequestSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    channel: z.enum(["email", "phone"]),
    destination: z.string().min(3),
  })
  .refine((b) => b.email || b.phone, {
    message: "Provide at least an email or a phone number",
  })

export const PostKycVerifySchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    channel: z.enum(["email", "phone"]),
    destination: z.string().min(3),
    code: z.string().regex(/^\d{6}$/, "Code is 6 digits"),
  })
  .refine((b) => b.email || b.phone, {
    message: "Provide at least an email or a phone number",
  })

export const PostKycIdentitySchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    id_type: z.enum(["nin"]),
    id_number: z.string().min(11).max(11),
  })
  .refine((b) => b.email || b.phone, {
    message: "Provide at least an email or a phone number",
  })

export default defineMiddlewares({
  routes: [
    {
      // Credential auth endpoints (login, register, update, reset-password) are
      // throttled per identity/IP. Uses the dynamic provider path so MFA, session
      // and token-refresh routes (normal flow, high frequency) are untouched.
      matcher: /^\/auth\/[^/]+\/[^/]+$/,
      method: ["POST"],
      middlewares: [AUTH_RATE_LIMIT],
    },
    {
      matcher: "/sellers",
      method: ["POST"],
      middlewares: [
        authenticate("seller", ["session", "bearer"], {
          allowUnregistered: true,
        }),
        validateAndTransformBody(PostSellerCreateSchema),
      ],
    },
    {
      matcher: "/sellers/*",
      middlewares: [
        authenticate("seller", ["session", "bearer"]),
      ],
    },
    {
      matcher: "/sellers/products",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(PostSellerMobileProductSchema),
      ],
    },
    {
      matcher: "/sellers/products/:id",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(PatchSellerMobileProductSchema),
      ],
    },
    {
      matcher: "/sellers/ai/listing",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiListingSchema)],
    },
    {
      matcher: "/sellers/ai/pricing",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiPricingSchema)],
    },
    {
      matcher: "/sellers/ai/insights",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiInsightsSchema)],
    },
    {
      matcher: "/sellers/ai/accounting",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiAccountingSchema)],
    },
    {
      matcher: "/sellers/ai/marketing",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiMarketingSchema)],
    },
    {
      matcher: "/sellers/ai/brief",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiBriefSchema)],
    },
    {
      matcher: "/sellers/ai/recommendations",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiRecommendationsSchema)],
    },
    {
      matcher: "/sellers/payout-accounts",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostPayoutAccountSchema)],
    },
    {
      matcher: "/sellers/payouts",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostSellerPayoutSchema)],
    },
    {
      matcher: "/store/wallet/withdrawal-accounts",
      methods: ["POST"],
      middlewares: [
        WALLET_RATE_LIMIT,
        validateAndTransformBody(PostWalletWithdrawalAccountSchema),
      ],
    },
    {
      matcher: "/store/wallet/withdrawals",
      methods: ["POST"],
      middlewares: [
        WALLET_RATE_LIMIT,
        validateAndTransformBody(PostWalletWithdrawalSchema),
      ],
    },
    {
      matcher: "/store/orders/:id/confirm-receipt",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostConfirmReceiptSchema)],
    },
    {
      matcher: "/store/orders/:id/request-return",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostRequestReturnSchema)],
    },
    {
      matcher: "/store/orders/:id/cancel-return",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostCancelReturnSchema)],
    },
    {
      matcher: "/admin/escrow/hold",
      methods: ["POST"],
      middlewares: [
        ADMIN_RATE_LIMIT,
        validateAndTransformBody(PostEscrowHoldSchema),
      ],
    },
    {
      matcher: "/admin/escrow/release",
      methods: ["POST"],
      middlewares: [
        ADMIN_RATE_LIMIT,
        validateAndTransformBody(PostEscrowReleaseSchema),
      ],
    },
    {
      matcher: "/sellers/redeemables",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostSellerRedeemableSchema)],
    },
    {
      matcher: "/sellers/redeemables/redeem",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostRedeemInStoreSchema)],
    },
    {
      matcher: "/store/carts/:id/apply-redeemable",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostApplyRedeemableSchema)],
    },
    {
      matcher: "/store/carts/:id/complete-marketplace",
      methods: ["POST"],
      middlewares: [CHECKOUT_RATE_LIMIT],
    },
    {
      matcher: "/store/orders/:id/review",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostCreateReviewSchema)],
    },
    {
      matcher: "/store/reviews/:id",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostEditReviewSchema)],
    },
    {
      matcher: "/store/reviews/:id",
      methods: ["DELETE"],
      middlewares: [validateAndTransformBody(DeleteReviewSchema)],
    },
    {
      matcher: "/sellers/reviews/:id/reply",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostReviewReplySchema)],
    },
    {
      matcher: "/admin/reviews/:id/remove",
      methods: ["POST"],
      middlewares: [
        ADMIN_RATE_LIMIT,
        validateAndTransformBody(PostRemoveReviewSchema),
      ],
    },
    {
      // Remaining custom admin routes have no body schema; throttle them only.
      matcher: "/admin/custom",
      methods: ["POST"],
      middlewares: [ADMIN_RATE_LIMIT],
    },
    {
      matcher: "/admin/commissions/reverse",
      methods: ["POST"],
      middlewares: [ADMIN_RATE_LIMIT],
    },
    {
      matcher: "/admin/malls/:id/go-live",
      methods: ["POST"],
      middlewares: [ADMIN_RATE_LIMIT],
    },
    {
      matcher: "/admin/payouts",
      methods: ["POST", "GET"],
      middlewares: [ADMIN_RATE_LIMIT],
    },
    {
      matcher: "/admin/payouts/run",
      methods: ["POST"],
      middlewares: [ADMIN_RATE_LIMIT],
    },
    {
      matcher: "/admin/payouts/:id/reconcile",
      methods: ["POST"],
      middlewares: [ADMIN_RATE_LIMIT],
    },
    {
      // Paystack signs the exact raw bytes — keep them for the HMAC check
      matcher: "/hooks/payouts/paystack",
      methods: ["POST"],
      bodyParser: { preserveRawBody: true },
    },
    {
      matcher: "/store/orders/:id/tip",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostBuyerTipSchema)],
    },
    {
      matcher: "/sellers/tips",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostSellerTipSchema)],
    },
    {
      matcher: "/sellers/referrals",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostReferralCreateSchema)],
    },
    {
      matcher: "/store/referrals",
      methods: ["POST"],
      middlewares: [REFERRAL_RATE_LIMIT, validateAndTransformBody(PostReferralClaimSchema)],
    },
    {
      // Seller (store owner) mall routes: publishable key + seller bearer both
      // required (the store namespace enforces the key, we enforce the actor).
      matcher: "/store/malls",
      methods: ["GET"],
      middlewares: [authenticate("seller", ["session", "bearer"])],
    },
    {
      matcher: "/store/malls",
      methods: ["POST"],
      middlewares: [
        authenticate("seller", ["session", "bearer"]),
        validateAndTransformBody(PostMallCreateSchema),
      ],
    },
    {
      matcher: "/store/malls/:id/join",
      methods: ["POST"],
      middlewares: [
        authenticate("seller", ["session", "bearer"]),
        validateAndTransformBody(PostMallJoinSchema),
      ],
    },
    {
      matcher: "/store/malls/:id/join-buyer",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostMallJoinBuyerSchema)],
    },
    {
      matcher: "/store/malls/:id/purchase",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostMallPurchaseSchema)],
    },
    {
      // Seller (store owner) posts a delivery job from a completed order.
      matcher: "/store/delivery-jobs",
      methods: ["POST"],
      middlewares: [
        authenticate("seller", ["session", "bearer"]),
        validateAndTransformBody(PostDeliveryJobSchema),
      ],
    },
    {
      matcher: "/store/delivery-jobs/mine",
      methods: ["GET"],
      middlewares: [authenticate("seller", ["session", "bearer"])],
    },
    {
      matcher: "/store/delivery-jobs/:id/offers",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostDeliveryOfferSchema)],
    },
    {
      matcher: "/store/delivery-jobs/:id/offers/:offerId/accept",
      methods: ["POST"],
      middlewares: [authenticate("seller", ["session", "bearer"])],
    },
    {
      matcher: "/store/delivery-jobs/:id/pickup",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostDeliveryPickupSchema)],
    },
    {
      matcher: "/store/delivery-jobs/:id/cancel",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostDeliveryCancelSchema)],
    },
    {
      matcher: "/store/delivery-jobs/:id/confirm",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostDeliveryConfirmSchema)],
    },
    {
      matcher: "/store/delivery-jobs/:id/chat",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostDeliveryChatSchema)],
    },
    {
      matcher: "/store/delivery-jobs/:id/verify/pickup",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostDeliveryVerifyGenerateSchema)],
    },
    {
      matcher: "/store/delivery-jobs/:id/verify/delivery",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostDeliveryVerifyGenerateSchema)],
    },
    {
      matcher: "/store/delivery-jobs/:id/verify",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostDeliveryVerifySchema)],
    },
    {
      matcher: "/kyc/request",
      methods: ["POST"],
      middlewares: [OTP_RATE_LIMIT, validateAndTransformBody(PostKycRequestSchema)],
    },
    {
      matcher: "/kyc/verify",
      methods: ["POST"],
      middlewares: [OTP_RATE_LIMIT, validateAndTransformBody(PostKycVerifySchema)],
    },
    {
      matcher: "/kyc/identity",
      methods: ["POST"],
      middlewares: [OTP_RATE_LIMIT, validateAndTransformBody(PostKycIdentitySchema)],
    },
  ],
})
