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
      // Paystack signs the exact raw bytes — keep them for the HMAC check
      matcher: "/hooks/payouts/paystack",
      methods: ["POST"],
      bodyParser: { preserveRawBody: true },
    },
  ],
})
