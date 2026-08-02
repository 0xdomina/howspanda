import {
  defineMiddlewares,
  authenticate,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { PostSellerCreateSchema } from "./sellers/route"

export const PostAiListingSchema = z.object({
  notes: z.string().min(3),
  category: z.string().optional(),
})

// Mobile-first listing: photo + price + short description. The route maps
// this minimal shape onto the full product create payload (default "One Size"
// option/variant, published, no inventory tracking). Full admin shape stays
// supported unchanged (options/variants supplied).
export const PostSellerMobileProductSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().max(500).optional(),
  price: z.number().positive().optional(),
  photo: z.string().url().optional(),
  currency_code: z
    .string()
    .default("ngn")
    .transform((c) => c.toLowerCase()),
  status: z.enum(["draft", "published"]).optional(),
  handle: z.string().optional(),
  images: z.array(z.object({ url: z.string().url() })).optional(),
  options: z.array(z.unknown()).optional(),
  variants: z.array(z.unknown()).optional(),
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
      middlewares: [validateAndTransformBody(PostEscrowHoldSchema)],
    },
    {
      matcher: "/admin/escrow/release",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostEscrowReleaseSchema)],
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
      middlewares: [validateAndTransformBody(PostRemoveReviewSchema)],
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
      middlewares: [validateAndTransformBody(PostReferralClaimSchema)],
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
      middlewares: [validateAndTransformBody(PostKycRequestSchema)],
    },
    {
      matcher: "/kyc/verify",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostKycVerifySchema)],
    },
    {
      matcher: "/kyc/identity",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostKycIdentitySchema)],
    },
  ],
})
