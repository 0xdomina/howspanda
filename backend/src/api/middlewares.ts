import {
  defineMiddlewares,
  authenticate,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { AdminCreateProduct } from "@medusajs/medusa/api/admin/products/validators"
import { z } from "@medusajs/framework/zod"
import { PostSellerCreateSchema } from "./sellers/route"

export const PostAiListingSchema = z.object({
  notes: z.string().min(3),
  category: z.string().optional(),
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
        validateAndTransformBody(AdminCreateProduct),
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
  ],
})
