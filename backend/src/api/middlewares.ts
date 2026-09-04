import {
  defineMiddlewares,
  authenticate,
  validateAndTransformBody,
  AuthenticatedMedusaRequest,
  MedusaRequestHandler,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import express from "express"
import path from "path"
import { rateLimit } from "../lib/security/rate-limit"
import { PostSellerCreateSchema } from "./sellers/route"
import {
  PatchSellerTeamSchema,
  PostSellerTeamSchema,
} from "./sellers/team/route"
import { PatchSellerMeSchema } from "./sellers/me/route"
import { PostCourierApplySchema } from "./store/couriers/apply/route"
import { assertCryptoAllowedForCart } from "../lib/payments/seller-crypto-gate"
import { CRYPTO_USDC_ID } from "../lib/payments/fees"
import {
  BANK_TRANSFER_PROVIDER_ID,
  getBankTransferSellerForCart,
} from "../lib/payments/bank-transfer-gate"
import { requirePlatformFeature } from "../lib/features/access"
import { signMediaPath } from "../lib/media/private-media"

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
    // Wallet routes require customer auth; key by the actor, not the body.
    const authed = req as AuthenticatedMedusaRequest
    return (authed.auth_context?.actor_id as string) ?? undefined
  },})
const CRYPTO_WALLET_PAY_RATE_LIMIT = rateLimit({
  name: "crypto-wallet-pay",
  limit: 10,
  windowMs: 60 * 60 * 1000,
  keyOf: (req) => {
    const authed = req as AuthenticatedMedusaRequest
    return (authed.auth_context?.actor_id as string) ?? undefined
  },})
const CHECKOUT_RATE_LIMIT = rateLimit({
  name: "checkout",
  limit: 60,
  windowMs: 15 * 60 * 1000,
})
const UPLOAD_RATE_LIMIT = rateLimit({
  name: "upload",
  limit: 30,
  windowMs: 15 * 60 * 1000,
  keyOf: (req) => {
    const authed = req as AuthenticatedMedusaRequest
    return (authed.auth_context?.actor_id as string) ?? undefined
  },
})
const MALL_RATE_LIMIT = rateLimit({
  name: "mall",
  limit: 30,
  windowMs: 60 * 60 * 1000,
  keyOf: (req) => {
    const b = req.body as { buyerEmail?: string } | undefined
    return b?.buyerEmail
  },
})
const DELIVERY_RATE_LIMIT = rateLimit({
  name: "delivery",
  limit: 20,
  windowMs: 10 * 60 * 1000,
  keyOf: (req) => {
    const authed = req as AuthenticatedMedusaRequest
    if (authed.auth_context?.actor_id) return authed.auth_context.actor_id as string
    const b = req.body as
      | { email?: string; courierEmail?: string; recipientEmail?: string }
      | undefined
    return b?.email || b?.courierEmail || b?.recipientEmail
  },
})
const GEO_RATE_LIMIT = rateLimit({
  name: "geo",
  limit: 30,
  windowMs: 15 * 60 * 1000,
})

const MEDIA_REDIRECT: MedusaRequestHandler = async (req, res, next) => {
  if (req.method !== "GET") return next()

  const originalUrl = req.originalUrl || req.url
  const rawPath = originalUrl.replace(/^\/media\/?/, "").split("?", 1)[0]
  const signedUrl = await signMediaPath(rawPath)

  if (!signedUrl) {
    res.status(404).json({ message: "Media not found" })
    return
  }

  // The signed URL is stable for ~7 days (memoized per key, refreshed 1d
  // before expiry — 7d is the SigV4 presign maximum). Cache the redirect well
  // inside the URL lifetime; B2 stays private — no public bucket needed.
  res.setHeader("Cache-Control", "public, max-age=259200, stale-while-revalidate=86400, immutable")
  res.redirect(302, signedUrl)
}
// Escrow-status polls are per-order ownership reads (email-gated); throttle by
// the queried email so an attacker cannot scrape order states wholesale.
const ESCROW_STATUS_RATE_LIMIT = rateLimit({
  name: "escrow-status",
  limit: 60,
  windowMs: 15 * 60 * 1000,
  keyOf: (req) => (req.query.email as string) || undefined,
})
const ADMIN_RATE_LIMIT = rateLimit({
  name: "admin",
  limit: 120,
  windowMs: 60 * 1000,
})
const MALL_FEATURE_GATE: MedusaRequestHandler = async (req, _res, next) => {
  try {
    await requirePlatformFeature(req.scope, "malls")
    next()
  } catch (error) {
    next(error)
  }
}
const NIN_FEATURE_GATE: MedusaRequestHandler = async (req, _res, next) => {
  try {
    await requirePlatformFeature(req.scope, "nin_verification")
    next()
  } catch (error) {
    next(error)
  }
}
// Follow/unfollow and giveaway claims are per-customer actor-keyed (abuse
// throttling without locking a NAT'd household together).
const FOLLOW_RATE_LIMIT = rateLimit({
  name: "follow",
  limit: 60,
  windowMs: 60 * 60 * 1000,
  keyOf: (req) => {
    const authed = req as AuthenticatedMedusaRequest
    return (authed.auth_context?.actor_id as string) ?? undefined
  },
})
const CLAIM_RATE_LIMIT = rateLimit({
  name: "claim",
  limit: 20,
  windowMs: 60 * 60 * 1000,
  keyOf: (req) => {
    const authed = req as AuthenticatedMedusaRequest
    return (authed.auth_context?.actor_id as string) ?? undefined
  },
})
// Cash tips book withdrawable seller balance, so they are auth-gated (route)
// and throttled per buyer email.
const TIP_RATE_LIMIT = rateLimit({
  name: "tip",
  limit: 10,
  windowMs: 60 * 60 * 1000,
  keyOf: (req) => {
    const b = req.body as { email?: string } | undefined
    return b?.email
  },
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

// Media references are either relative upload paths (/uploads/...) returned by
// the seller upload endpoint or absolute http(s) URLs. Everything else (plain
// string, javascript:, file:) is rejected.
const MEDIA_URL = z
  .string()
  .refine(
    (v) =>
      /^\/uploads\/[a-z]+\/[\w.-]+$/.test(v) || /^https?:\/\//i.test(v),
    "Must be an uploaded /uploads/ path or an absolute http(s) URL"
  )

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
  photo: MEDIA_URL.optional(),
  photos: z.array(MEDIA_URL).max(4).optional(),
  banner_url: MEDIA_URL.optional(),
  // Product showcase video (feature-flagged). Stored in product metadata as
  // `product_video` so the product entity needs no new column.
  video_url: MEDIA_URL.optional(),
  // Quantity to sell for a single-option product (maps onto the default
  // "One Size" variant's inventory level).
  stock: z.number().int().min(0).optional(),
  currency_code: z
    .string()
    .default("ngn")
    .transform((c) => c.toLowerCase()),
  status: z.enum(["draft", "published"]).optional(),
  flash_sale: z.boolean().optional(),
  homepage_banner: z.boolean().optional(),
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
  photo: MEDIA_URL.optional(),
  photos: z.array(MEDIA_URL).max(4).optional(),
  banner_url: MEDIA_URL.nullable().optional(),
  // null clears the product video; a URL replaces it.
  video_url: MEDIA_URL.nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  flash_sale: z.boolean().optional(),
  homepage_banner: z.boolean().optional(),
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

// Buyer chat (Phase: model router). `client_key` is the guest identity — a
// high-entropy secret the client generates and keeps private so an anonymous
// buyer can persist threads without an account. Never logged.
export const PostAiChatSchema = z.object({
  conversation_id: z.string().optional(),
  message: z.string().min(1).max(4000),
  client_key: z.string().min(12).max(200).optional(),
  title: z.string().min(1).max(120).optional(),
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
    network: z.enum(["base", "solana", "arc"]),
    address: z.string().min(10),
  }),
])

export const PostSellerPayoutSchema = z.object({
  rail: z.enum(["paystack", "crypto-usdc"]),
  idempotency_key: z.string().optional(),
})

// Buyer wallet withdrawal (Phase 15): ownership comes from the customer JWT
// actor (see store/wallet routes) — the body email is ignored/legacy.
export const PostWalletWithdrawalAccountSchema = z.object({
  buyerEmail: z.string().email().optional(),
  type: z.enum(["bank_account", "crypto_address"]),
  bank_code: z.string().min(3).optional(),
  account_number: z.string().regex(/^\d{10}$/, "NUBAN is 10 digits").optional(),
  network: z.enum(["base", "solana", "arc"]).optional(),
  address: z.string().min(10).optional(),
})

export const PostWalletWithdrawalSchema = z.object({
  buyerEmail: z.string().email().optional(),
  rail: z.enum(["paystack", "crypto-usdc"]),
  amount: z.number().positive(),
  idempotency_key: z.string().optional(),
})

// Managed per-user USDC wallet (Phase 16): the customer authenticates with
// their JWT actor and the destination address is derived server-side from the
// crypto-usdc payment session — a client can NEVER choose where the money
// goes (that would be the drain path). The spend is one per session.
export const PostCryptoWalletPaySchema = z.object({
  session_id: z.string().min(1),
  idempotency_key: z.string().optional(),
})

// Send USDC out of the managed per-user wallet to ANY external USDC address.
// The transfer is gated by re-entering the account password — the only proof
// that the request really comes from the wallet owner. The `reference` for the
// spend is derived server-side from the idempotency key; one transfer per key.
export const PostCryptoWalletWithdrawSchema = z.object({
  to_address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid USDC address format"),
  usdc_amount: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,6})?$/, "USDC amount must be a 6-decimal string")
    .refine((v) => Number(v) > 0, "USDC amount must be positive"),
  password: z.string().min(1),
  idempotency_key: z.string().min(1),
})

// Dev/mock-only top-up so the fund→spend flow can be exercised offline. Only
// reachable when the wallet signer is the in-process mock (no real chain).
export const PostCryptoWalletFundSchema = z.object({
  amount: z.number().positive().max(1000000).default(100),
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

// Buyer submits bank-transfer proof; the seller rejects it with a note.
export const PostBankProofSchema = z.object({
  email: z.string().email(),
  reference: z.string().trim().min(1),
  // Payment proofs must point to a file uploaded through our image-only
  // proof endpoint. Accepting arbitrary URLs here would let a buyer persist
  // third-party pixels or markup-looking media that the seller UI later
  // renders as an image.
  proof_url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => {
      const privatePrefix = (process.env.PRIVATE_S3_PREFIX || "payment-proofs").replace(/^\/+|\/+$/g, "")
      const sharedPrefix = (process.env.S3_PREFIX || "public howsyou").replace(/^\/+|\/+$/g, "")
      const proofPrefix = process.env.PRIVATE_S3_USE_MEDIA_BUCKET === "true"
        ? `${sharedPrefix}/${privatePrefix}`
        : privatePrefix
      // Production proofs must come from the private proof bucket. Local disk
      // paths are development-only, and public product-media URLs must never
      // be accepted for a payment proof.
      if (
        process.env.NODE_ENV !== "production" &&
        /^\/uploads\/proof\/[\w.-]+$/.test(value)
      ) return true
      if (/^private:\/\/[A-Za-z0-9_ .\/-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(value)) {
        return value.startsWith(`private://${proofPrefix}/`) && !value.includes("..")
      }
      if (process.env.NODE_ENV === "production") return false
      if (!process.env.S3_URL) return false
      try {
        const candidate = new URL(value)
        const configured = new URL(process.env.S3_URL)
        const prefix = configured.pathname.replace(/\/$/, "")
        return (
          candidate.protocol === "https:" &&
          candidate.origin === configured.origin &&
          candidate.pathname.startsWith(`${prefix}/`)
        )
      } catch {
        return false
      }
    }, "Invalid proof upload")
    .optional(),
  // This is a buyer claim for the seller to compare with the bank ledger; it
  // is never used to mark an order paid. Keep it bounded so malformed values
  // cannot pollute payment records or seller dashboards.
  amount: z.number().positive().max(1_000_000_000_000).optional(),
  note: z.string().trim().min(1).max(500).optional(),
})

export const PostBankProofRejectSchema = z.object({
  note: z.string().trim().min(1).max(500),
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
  design_variant: z.enum(["sunset", "midnight", "mint", "candy", "cobalt"]).default("sunset"),
  background_image: z.string().url().nullable().optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  message: z.string().max(180).nullable().optional(),
  event_name: z.string().trim().max(160).nullable().optional(),
  venue_name: z.string().trim().max(160).nullable().optional(),
  venue_address: z.string().trim().max(300).nullable().optional(),
  event_starts_at: z.coerce.date().nullable().optional(),
  event_ends_at: z.coerce.date().nullable().optional(),
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
}).refine((body) => {
  const choices = [
    Number.isFinite(body.amount) && Number(body.amount) > 0,
    !!body.product_id || !!body.product_title,
    !!body.redeemable_code,
  ].filter(Boolean)
  return choices.length === 1
}, "Choose one tip: cash, product, or redeemable code").refine((body) => (
  body.amount == null || (body.amount >= 100 && body.amount <= 50000)
), "Cash tips must be between ₦100 and ₦50,000")

// Growth (Phase 9): referrals
export const PostReferralCreateSchema = z.object({
  referee_email: z.string().email(),
})

export const PostReferralClaimSchema = z.object({
  code: z.string().min(1),
  email: z.string().email(),
})

// Challenges (Phases 17-18): campaigns live as `draft` until admin flips them
// live; `config` carries the per-type reward rules (milestones/buyer reward/cap
// for invite; ticket spend/winner count for arc_pool).
export const PostChallengeCreateSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().max(2000).optional(),
  type: z.enum(["invite", "arc_pool"]),
  audience: z.enum(["sellers", "buyers", "all"]).default("all"),
  starts_at: z.coerce.date().optional(),
  ends_at: z.coerce.date().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

export const PatchChallengeUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["draft", "live", "ended"]).optional(),
  starts_at: z.coerce.date().nullable().optional(),
  ends_at: z.coerce.date().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

export const PostChallengeClaimSchema = z.object({
  reward_id: z.string().min(1),
})

export const PostChallengeDrawSchema = z.object({
  winner_count: z.number().int().min(1).optional(),
  prize_amount_ngn: z.number().positive().optional(),
  seed: z.string().optional(),
})

export const PostChallengeSettleSchema = z.object({
  pool_ngn: z.number().positive(),
})

// Malls (Phase 10)
export const PostMallCreateSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(500).optional(),
  prizeWinnerCount: z.number().int().min(1),
  prizeDistribution: z.enum(["equal", "random"]).optional(),
  prizePoolNgn: z.number().positive(),
  productIds: z.array(z.string().min(1)).min(1),
})

export const PostProductRequestSchema = z.object({
  request: z.string().trim().min(1).max(100),
})

export const PatchProductRequestSchema = z.object({
  status: z.enum(["reviewing", "available", "not_available", "closed"]),
  seller_note: z.string().trim().max(500).optional(),
  product_id: z.string().min(1).optional(),
})

const AI_CHAT_RATE_LIMIT = rateLimit({
  name: "ai-chat",
  limit: 30,
  windowMs: 15 * 60 * 1000,
  keyOf: (req) => {
    const body = req.body as { client_key?: string } | undefined
    return body?.client_key
  },
})

export const PostMallJoinSchema = z.object({
  contributionNgn: z.number().positive(),
  productIds: z.array(z.string().min(1)).min(1),
  redeemableId: z.string().min(1).optional(),
})

export const PostMallJoinBuyerSchema = z.object({})

export const PostMallPurchaseSchema = z.object({
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
  postedPrice: z.number().positive().max(1000000),
})

export const PostDeliveryOfferSchema = z.object({
  courierEmail: z.string().email().optional(),
  offeredPrice: z.number().positive().max(1000000),
})

export const PostDeliveryPickupSchema = z.object({
  courierEmail: z.string().email().optional(),
})

export const PostDeliveryCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
})

export const PostDeliveryConfirmSchema = z.object({})

// Chat + POD verification (Phase 12)
export const PostDeliveryChatSchema = z.object({
  body: z.string().min(1).max(2000),
})

export const PostDeliveryVerifyGenerateSchema = z.object({})

export const PostDeliveryVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code is 6 digits"),
  purpose: z.enum(["pickup", "delivery"]),
})

// KYC uses email OTP only. Phone remains a contact field, not a verification
// rung, until a real provider is connected.
export const PostKycRequestSchema = z
  .object({
    email: z.string().email(),
    channel: z.literal("email"),
    destination: z.string().min(3),
  })

export const PostKycVerifySchema = z
  .object({
    email: z.string().email(),
    channel: z.literal("email"),
    destination: z.string().min(3),
    code: z.string().regex(/^\d{6}$/, "Code is 6 digits"),
  })

// Auth OTP (Phase: true OTP for signup verify + forgot-password reset). The
// code is always a 6-digit value issued for the exact email; verification
// enforces the stored hash (no bypass). The raw code is echoed back only
// outside production so local/dev flows can complete without a mail provider.
export const PostAuthOtpRequestSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(["signup", "reset", "email_change"]),
})

export const PostAuthOtpVerifySchema = z.object({
  email: z.string().email(),
  purpose: z.enum(["signup", "reset", "email_change"]),
  code: z.string().regex(/^\d{6}$/, "Code is 6 digits"),
})

export const PostAuthOtpResetSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "Code is 6 digits"),
  newPassword: z.string().min(8),
})

export const PostAuthOtpAssertSchema = z.object({
  email: z.string().email(),
  proof: z.string().min(10),
})

export const PostAuthOtpSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  code: z.string().regex(/^\d{6}$/, "Code is 6 digits"),
  first_name: z.string().trim().max(100).optional(),
  last_name: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(50).optional(),
})

export const PostWishlistReplaceSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(200),
    handle: z.string().max(200).optional(),
    title: z.string().min(1).max(300),
    thumbnail: z.string().max(2000).nullable().optional(),
    price: z.string().max(100).optional(),
  })).max(100),
})

export const PostEmailChangeRequestSchema = z.object({
  new_email: z.string().email(),
  current_password: z.string().min(1),
})

export const PostEmailChangeConfirmSchema = z.object({
  new_email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "Code is 6 digits"),
})

// Payment rails (runtime toggle). `enabled` is the only mutable field — the
// mode (mock/test/live) is always derived from env keys and reported read-only.
export const PatchPaymentRailSchema = z.object({
  enabled: z.boolean(),
})

export const PatchPlatformFeatureSchema = z.object({
  enabled: z.boolean(),
})

// Store broadcasts (followers). Body is additionally privacy-scanned in the
// service (emails/phones rejected) so contact never leaks off-platform.
export const PostBroadcastSchema = z
  .object({
    type: z.enum(["general", "product", "offer", "voucher", "giveaway"]),
    title: z.string().min(1).max(80),
    body: z.string().min(1).max(2000),
    product_id: z.string().optional(),
    voucher: z
      .object({
        discount_type: z.enum(["fixed", "percent"]),
        discount_value: z.number().positive(),
        expires_in_days: z.number().int().min(1).max(90).optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "voucher" && !data.voucher) {
      ctx.addIssue({
        code: "custom",
        path: ["voucher"],
        message: "Voucher broadcasts need discount details",
      })
    }
  })

export const PostKycIdentitySchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    id_type: z.enum(["nin"]),
    id_number: z.string().min(11).max(11),
    // Fields OCR'd client-side from the ID card. Optional — the backend match
    // (on when FEATURE_NIN_VERIFICATION is true) needs the name at minimum.
    extracted: z
      .object({
        id_number: z.string().max(11).optional(),
        first_name: z.string().trim().max(100).optional(),
        last_name: z.string().trim().max(100).optional(),
        other_name: z.string().trim().max(100).optional(),
        date_of_birth: z.string().trim().max(20).optional(),
        country: z.string().trim().max(80).optional(),
        state: z.string().trim().max(80).optional(),
        city: z.string().trim().max(80).optional(),
        address: z.string().trim().max(300).optional(),
      })
      .optional(),
  })
  .refine((b) => b.email || b.phone, {
    message: "Provide at least an email or a phone number",
  })

export const PostKycReviewSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    decision: z.enum(["verified", "rejected"]),
  })
  .refine((b) => b.email || b.phone, {
    message: "Provide at least an email or a phone number",
  })

// Personal profile rung of the KYC ladder. Fields are optional individually —
// the ladder is progressive — but profile_completed only unlocks once the
// required fields (name, address, country, state, city) are all present.
export const PostKycProfileSchema = z.object({  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().min(7).max(32),
  other_name: z.string().trim().min(1).max(100).optional(),
  address: z.string().trim().min(1).max(300).optional(),
  country: z.string().trim().min(1).max(80).optional(),
  state: z.string().trim().min(1).max(80).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  postal_code: z.string().trim().min(1).max(20).optional(),
})

// Per-seller crypto gate: a crypto-usdc payment session may only be created for
// a cart where EVERY seller has crypto payments enabled. Resolves the cart from
// the payment collection id (via the cart_payment_collection link) and rejects
// when any represented seller turned the rail off.
const enforceCryptoSellerGate: MedusaRequestHandler = async (req, res, next) => {
  try {
    const providerId = (req.body as { provider_id?: string } | undefined)
      ?.provider_id
    if (providerId !== CRYPTO_USDC_ID) {
      return next()
    }

    const collectionId = (req.params as { id?: string }).id
    if (!collectionId) {
      return next()
    }

    const remoteQuery = req.scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY)
    const [link] = await remoteQuery(
      remoteQueryObjectFromString({
        entryPoint: "cart_payment_collection",
        variables: { filters: { payment_collection_id: collectionId } },
        fields: ["cart_id"],
      })
    )

    const cartId = link?.cart_id
    if (!cartId) {
      return next()
    }

    await assertCryptoAllowedForCart(req.scope, cartId)
    return next()
  } catch (e) {
    return next(e)
  }
}

// Bank-transfer rail gate: a pp_system_default (manual) payment session may
// only be created for a cart that can actually receive a direct-to-seller
// transfer — a single seller with a verified bank payout account.
const enforceBankTransferGate: MedusaRequestHandler = async (req, res, next) => {
  try {
    const providerId = (req.body as { provider_id?: string } | undefined)
      ?.provider_id
    if (providerId !== BANK_TRANSFER_PROVIDER_ID) {
      return next()
    }

    const collectionId = (req.params as { id?: string }).id
    if (!collectionId) {
      return next()
    }

    const remoteQuery = req.scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY)
    const [link] = await remoteQuery(
      remoteQueryObjectFromString({
        entryPoint: "cart_payment_collection",
        variables: { filters: { payment_collection_id: collectionId } },
        fields: ["cart_id"],
      })
    )

    const cartId = link?.cart_id
    if (!cartId) {
      return next()
    }

    const seller = await getBankTransferSellerForCart(req.scope, cartId)
    if (!seller) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Bank transfer is unavailable for this cart — it must contain a single store with a verified payout account."
      )
    }
    return next()
  } catch (e) {
    return next(e)
  }
}

export default defineMiddlewares({
  routes: [
    {
      // Custom operational routes under /admin are not covered by Medusa's
      // built-in admin middleware files. Keep one explicit guard here so a
      // future custom admin endpoint cannot accidentally ship unauthenticated.
      matcher: "/admin/*",
      middlewares: [authenticate("user", ["session", "bearer", "api-key"])],
    },
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
        authenticate(["customer", "seller"], ["session", "bearer"], {
          allowUnregistered: true,
        }),
        validateAndTransformBody(PostSellerCreateSchema),
      ],
    },
    {
      matcher: "/sellers/*",
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
      ],
    },
    {
      // Store owner provisions a staff login for their store.
      matcher: "/sellers/team",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostSellerTeamSchema)],
    },
    {
      matcher: "/sellers/team/:id",
      methods: ["PATCH"],
      middlewares: [validateAndTransformBody(PatchSellerTeamSchema)],
    },
    {
      // Store settings + own profile. Auth comes from the /sellers/* matcher.
      matcher: "/sellers/me",
      methods: ["PATCH"],
      middlewares: [validateAndTransformBody(PatchSellerMeSchema)],
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
      // Buyer chat: auth optional (a signed-in customer is identified by their
      // actor; guests identify via the client_key in the body/query/header).
      matcher: "/store/ai/chat",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
        AI_CHAT_RATE_LIMIT,
        validateAndTransformBody(PostAiChatSchema),
      ],
    },
    {
      matcher: "/store/ai/chat",
      methods: ["GET"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
    },
    {
      matcher: "/store/ai/chat/conversations",
      methods: ["GET"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
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
      matcher: "/store/wallet",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/wallet/withdrawal-accounts",
      middlewares: [authenticate("customer", ["session", "bearer"])],
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
      middlewares: [authenticate("customer", ["session", "bearer"])],
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
      matcher: "/store/crypto-wallet",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/crypto-wallet/fund",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        CRYPTO_WALLET_PAY_RATE_LIMIT,
        validateAndTransformBody(PostCryptoWalletFundSchema),
      ],
    },
    {
      matcher: "/store/crypto-wallet/pay",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        CRYPTO_WALLET_PAY_RATE_LIMIT,
        validateAndTransformBody(PostCryptoWalletPaySchema),
      ],
    },
    {
      matcher: "/store/crypto-wallet/withdraw",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        CRYPTO_WALLET_PAY_RATE_LIMIT,
        validateAndTransformBody(PostCryptoWalletWithdrawSchema),
      ],
    },
    {
      matcher: "/store/orders/:id/escrow-status",
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
        ESCROW_STATUS_RATE_LIMIT,
      ],
    },
    {
      matcher: "/store/orders/:id/confirm-receipt",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
        validateAndTransformBody(PostConfirmReceiptSchema),
      ],
    },
    {
      matcher: "/store/orders/:id/request-return",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
        validateAndTransformBody(PostRequestReturnSchema),
      ],
    },
    {
      matcher: "/store/orders/:id/cancel-return",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
        validateAndTransformBody(PostCancelReturnSchema),
      ],
    },
    {
      // Buyer view of their direct-to-seller bank transfer (account, reference,
      // proof status, rejection note + recheck deadline).
      matcher: "/store/orders/:id/bank-transfer",
      methods: ["GET"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
        ESCROW_STATUS_RATE_LIMIT,
      ],
    },
    {
      matcher: "/store/orders/:id/bank-proof",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
        CHECKOUT_RATE_LIMIT,
        validateAndTransformBody(PostBankProofSchema),
      ],
    },
    {
      // Seller rejects the buyer's proof with a note (opens the recheck
      // window). Auth comes from the /sellers/* matcher above.
      matcher: "/sellers/orders/:id/bank-proof/reject",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostBankProofRejectSchema)],
    },
    {
      matcher: "/store/orders/:id/review",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
        validateAndTransformBody(PostCreateReviewSchema),
      ],
    },
    {
      matcher: "/store/orders/:id/tip",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        TIP_RATE_LIMIT,
        validateAndTransformBody(PostBuyerTipSchema),
      ],
    },
    {
      matcher: "/store/sellers/:handle/requests",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        TIP_RATE_LIMIT,
        validateAndTransformBody(PostProductRequestSchema),
      ],
    },
    {
      matcher: "/store/requests",
      methods: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
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
      matcher: "/store/redeemables/mine",
      methods: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
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
      // Per-seller gates on payment session creation: reject a crypto-usdc
      // session when any seller disabled crypto, and a bank-transfer session
      // when the cart can't receive a direct-to-seller transfer.
      matcher: "/store/payment-collections/:id/payment-sessions",
      methods: ["POST"],
      middlewares: [enforceCryptoSellerGate, enforceBankTransferGate],
    },
    {
      matcher: "/store/reviews/:id",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
        validateAndTransformBody(PostEditReviewSchema),
      ],
    },
    {
      matcher: "/store/reviews/:id",
      methods: ["DELETE"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
        validateAndTransformBody(DeleteReviewSchema),
      ],
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
      middlewares: [ADMIN_RATE_LIMIT, MALL_FEATURE_GATE],
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
      matcher: "/admin/challenges",
      methods: ["GET", "POST"],
      middlewares: [
        ADMIN_RATE_LIMIT,
        validateAndTransformBody(PostChallengeCreateSchema),
      ],
    },
    {
      matcher: "/admin/challenges/:id",
      methods: ["GET", "PATCH"],
      middlewares: [
        ADMIN_RATE_LIMIT,
        validateAndTransformBody(PatchChallengeUpdateSchema),
      ],
    },
    {
      matcher: "/admin/challenges/:id/draw",
      methods: ["POST"],
      middlewares: [
        ADMIN_RATE_LIMIT,
        validateAndTransformBody(PostChallengeDrawSchema),
      ],
    },
    {
      matcher: "/admin/challenges/:id/settle",
      methods: ["POST"],
      middlewares: [
        ADMIN_RATE_LIMIT,
        validateAndTransformBody(PostChallengeSettleSchema),
      ],
    },
    {
      matcher: "/admin/kyc/review",
      methods: ["POST"],
      middlewares: [
        ADMIN_RATE_LIMIT,
        validateAndTransformBody(PostKycReviewSchema),
      ],
    },
    {
      // Paystack signs the exact raw bytes — keep them for the HMAC check
      matcher: "/hooks/payouts/paystack",
      methods: ["POST"],
      bodyParser: { preserveRawBody: true },
    },
    {
      matcher: "/sellers/tips",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostSellerTipSchema)],
    },
    {
      matcher: "/sellers/requests/:id",
      methods: ["PATCH"],
      middlewares: [validateAndTransformBody(PatchProductRequestSchema)],
    },
    {
      matcher: "/sellers/referrals",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostReferralCreateSchema)],
    },
    {
      matcher: "/store/referrals",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
        REFERRAL_RATE_LIMIT,
        validateAndTransformBody(PostReferralClaimSchema),
      ],
    },
    {
      // Challenge detail + standing: auth optional so anonymous browsing works.
      matcher: "/store/challenges/:slug",
      methods: ["GET"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
    },
    {
      matcher: "/store/challenges/:slug/claim",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        CLAIM_RATE_LIMIT,
        validateAndTransformBody(PostChallengeClaimSchema),
      ],
    },
    {
      // Seller claim: auth comes from the /sellers/* matcher above.
      matcher: "/sellers/challenges/:slug/claim",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostChallengeClaimSchema)],
    },
    {
      // Seller (store owner) mall routes: publishable key + seller bearer both
      // required (the store namespace enforces the key, we enforce the actor).
      matcher: "/store/malls",
      methods: ["GET"],
      middlewares: [
        MALL_FEATURE_GATE,
        authenticate(["customer", "seller"], ["session", "bearer"]),
      ],
    },
    {
      matcher: "/store/malls",
      methods: ["POST"],
      middlewares: [
        MALL_FEATURE_GATE,
        authenticate(["customer", "seller"], ["session", "bearer"]),
        validateAndTransformBody(PostMallCreateSchema),
      ],
    },
    {
      matcher: "/store/malls/*",
      middlewares: [MALL_FEATURE_GATE],
    },
    {
      // Public mall browsing can optionally annotate the signed-in buyer's
      // participation without exposing anyone else's email.
      matcher: "/store/malls/:id",
      methods: ["GET"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
    },
    {
      matcher: "/store/malls/:id/join",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        validateAndTransformBody(PostMallJoinSchema),
      ],
    },
    {
      // Author-only mall lifecycle after expiry: re-launch or cancel.
      matcher: "/store/malls/:id/relaunch",
      methods: ["POST"],
      middlewares: [authenticate(["customer", "seller"], ["session", "bearer"])],
    },
    {
      matcher: "/store/malls/:id/cancel",
      methods: ["POST"],
      middlewares: [authenticate(["customer", "seller"], ["session", "bearer"])],
    },
    {
      // Public win ticker for the storefront malls pages.
      matcher: "/store/malls/wins",
      methods: ["GET"],
      middlewares: [],
    },
    {
      matcher: "/store/malls/:id/join-buyer",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        MALL_RATE_LIMIT,
        validateAndTransformBody(PostMallJoinBuyerSchema),
      ],
    },
    {
      matcher: "/store/malls/:id/purchase",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        MALL_RATE_LIMIT,
        validateAndTransformBody(PostMallPurchaseSchema),
      ],
    },
    {
      // Seller (store owner) posts a delivery job from a completed order.
      matcher: "/store/delivery-jobs",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        validateAndTransformBody(PostDeliveryJobSchema),
      ],
    },
    {
      // Geocoding is an anonymous upstream call; keep it bounded so a public
      // client cannot proxy unlimited address lookups to Nominatim.
      matcher: "/store/geo/:route",
      methods: ["GET"],
      middlewares: [GEO_RATE_LIMIT],
    },
    {
      matcher: "/store/delivery-jobs/mine",
      methods: ["GET"],
      middlewares: [authenticate(["customer", "seller"], ["session", "bearer"])],
    },
    {
      // Courier application: only a signed-in customer or seller account can
      // apply (the route derives the courier's identity from the actor).
      matcher: "/store/couriers/apply",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        DELIVERY_RATE_LIMIT,
        validateAndTransformBody(PostCourierApplySchema),
      ],
    },
    {
      // Courier dashboard: application status, KYC level, activity, earnings.
      matcher: "/store/couriers/me",
      methods: ["GET"],
      middlewares: [authenticate(["customer", "seller"], ["session", "bearer"])],
    },
    {
      // KYC lives on the user profile: any signed-in account reads its own
      // platform-wide KYC state here.
      matcher: "/store/kyc/me",
      methods: ["GET"],
      middlewares: [authenticate(["customer", "seller"], ["session", "bearer"])],
    },
    {
      // Save the personal profile rung of the KYC ladder for the signed-in
      // user. The actor is the profile owner — no identifiers come from the
      // body, everything is anchored to their account.
      matcher: "/store/kyc/profile",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        validateAndTransformBody(PostKycProfileSchema),
      ],
    },
    {
      // Offers are courier actions: the courier identity comes from the signed
      // in customer/seller actor (never from the body), and the route enforces
      // the phone-verified KYC level that activates courierhood.
      matcher: "/store/delivery-jobs/:id/offers",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        validateAndTransformBody(PostDeliveryOfferSchema),
      ],
    },
    {
      matcher: "/store/delivery-jobs/:id/offers/:offerId/accept",
      methods: ["POST"],
      middlewares: [authenticate(["customer", "seller"], ["session", "bearer"])],
    },
    {
      matcher: "/store/delivery-jobs/:id/pickup",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        DELIVERY_RATE_LIMIT,
        validateAndTransformBody(PostDeliveryPickupSchema),
      ],
    },
    {
      matcher: "/store/delivery-jobs/:id/cancel",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        DELIVERY_RATE_LIMIT,
        validateAndTransformBody(PostDeliveryCancelSchema),
      ],
    },
    {
      matcher: "/store/delivery-jobs/:id/confirm",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        DELIVERY_RATE_LIMIT,
        validateAndTransformBody(PostDeliveryConfirmSchema),
      ],
    },
    {
      // Public job details remain browseable, but an optional session allows
      // accepted job parties to receive the courier's contact number.
      matcher: "/store/delivery-jobs/:id",
      methods: ["GET"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
    },
    {
      matcher: "/sellers/uploads",
      methods: ["POST"],
      middlewares: [UPLOAD_RATE_LIMIT],
    },
    {
      matcher: "/sellers/uploads/prepare",
      methods: ["POST"],
      middlewares: [UPLOAD_RATE_LIMIT],
    },
    {
      matcher: "/sellers/uploads/complete",
      methods: ["POST"],
      middlewares: [UPLOAD_RATE_LIMIT],
    },
    {
      // Bank-proof uploads are intentionally guest-compatible because the
      // order email is checked when the proof is attached, but the presigned
      // prepare/complete pair still needs an IP bucket to prevent B2 exhaustion.
      matcher: "/store/uploads",
      methods: ["POST"],
      middlewares: [UPLOAD_RATE_LIMIT],
    },
    {
      matcher: "/store/delivery-jobs/:id/chat",
      methods: ["GET"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        DELIVERY_RATE_LIMIT,
      ],
    },
    {
      matcher: "/store/delivery-jobs/:id/chat",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        DELIVERY_RATE_LIMIT,
        validateAndTransformBody(PostDeliveryChatSchema),
      ],
    },
    {
      matcher: "/store/delivery-jobs/:id/verify/pickup",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        DELIVERY_RATE_LIMIT,
        validateAndTransformBody(PostDeliveryVerifyGenerateSchema),
      ],
    },
    {
      matcher: "/store/delivery-jobs/:id/verify/delivery",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        DELIVERY_RATE_LIMIT,
        validateAndTransformBody(PostDeliveryVerifyGenerateSchema),
      ],
    },
    {
      matcher: "/store/delivery-jobs/:id/verify",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        DELIVERY_RATE_LIMIT,
        validateAndTransformBody(PostDeliveryVerifySchema),
      ],
    },
    {
      matcher: "/kyc/status",
      methods: ["GET"],
      middlewares: [authenticate(["customer", "seller"], ["session", "bearer"])],
    },
    {
      matcher: "/kyc/request",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        OTP_RATE_LIMIT,
        validateAndTransformBody(PostKycRequestSchema),
      ],
    },
    {
      matcher: "/kyc/verify",
      methods: ["POST"],
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        OTP_RATE_LIMIT,
        validateAndTransformBody(PostKycVerifySchema),
      ],
    },
    {
      matcher: "/kyc/identity",
      methods: ["POST"],
      // Multipart identity uploads are parsed inside the route. Authenticate
      // first so a caller cannot submit KYC against another email/phone.
      middlewares: [
        authenticate(["customer", "seller"], ["session", "bearer"]),
        OTP_RATE_LIMIT,
        NIN_FEATURE_GATE,
      ],
    },
    {
      matcher: "/auth/otp/request",
      methods: ["POST"],
      middlewares: [OTP_RATE_LIMIT, validateAndTransformBody(PostAuthOtpRequestSchema)],
    },
    {
      matcher: "/auth/otp/verify",
      methods: ["POST"],
      middlewares: [OTP_RATE_LIMIT, validateAndTransformBody(PostAuthOtpVerifySchema)],
    },
    {
      matcher: "/auth/otp/reset",
      methods: ["POST"],
      middlewares: [OTP_RATE_LIMIT, validateAndTransformBody(PostAuthOtpResetSchema)],
    },
    {
      matcher: "/auth/otp/assert",
      methods: ["POST"],
      middlewares: [OTP_RATE_LIMIT, validateAndTransformBody(PostAuthOtpAssertSchema)],
    },
    {
      matcher: "/auth/otp/signup",
      methods: ["POST"],
      middlewares: [OTP_RATE_LIMIT, validateAndTransformBody(PostAuthOtpSignupSchema)],
    },
    {
      matcher: "/auth/email/change/request",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        OTP_RATE_LIMIT,
        validateAndTransformBody(PostEmailChangeRequestSchema),
      ],
    },
    {
      matcher: "/auth/email/change/confirm",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        OTP_RATE_LIMIT,
        validateAndTransformBody(PostEmailChangeConfirmSchema),
      ],
    },
    {
      matcher: "/store/wishlist",
      methods: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/wishlist",
      methods: ["PUT"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        validateAndTransformBody(PostWishlistReplaceSchema),
      ],
    },
    {
      matcher: "/admin/payment-rails",
      methods: ["GET"],
      middlewares: [ADMIN_RATE_LIMIT],
    },
    {
      matcher: "/admin/payment-rails/:key",
      methods: ["PATCH"],
      middlewares: [
        ADMIN_RATE_LIMIT,
        validateAndTransformBody(PatchPaymentRailSchema),
      ],
    },
    {
      matcher: "/admin/features",
      methods: ["GET"],
      middlewares: [ADMIN_RATE_LIMIT],
    },
    {
      matcher: "/admin/features/:key",
      methods: ["PATCH"],
      middlewares: [
        ADMIN_RATE_LIMIT,
        validateAndTransformBody(PatchPlatformFeatureSchema),
      ],
    },
    {
      // Public storefront (profile + follower count). Auth optional so a signed-
      // in buyer gets `followed_by_viewer` without blocking anonymous browsing.
      matcher: "/store/sellers/:handle",
      methods: ["GET"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
    },
    {
      matcher: "/store/sellers/:handle/follow",
      methods: ["POST", "DELETE"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        FOLLOW_RATE_LIMIT,
      ],
    },
    {
      matcher: "/store/notifications",
      methods: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/notifications/:id/read",
      methods: ["POST"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/broadcasts/:id/claim",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        CLAIM_RATE_LIMIT,
      ],
    },
    {
      // Seller broadcasts: auth comes from the /sellers/* matcher above.
      matcher: "/sellers/broadcasts",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostBroadcastSchema)],
    },
    {
      // Backblaze media URLs can contain nested object-key segments. Keep the
      // proxy in middleware so Express receives a normal prefix mount instead
      // of a bracket-style catch-all route.
      matcher: "/media",
      middlewares: [MEDIA_REDIRECT],
    },
    {
      // Uploaded media is served publicly (product photos render in <img> tags
      // on store pages) but only as the exact bytes we wrote: whitelisted
      // extension → whitelisted Content-Type, nosniff so the browser never
      // sniff-executes, and immutable cache headers. The files are written by
      // POST /sellers/uploads after magic-byte validation.
      matcher: "/uploads",
      middlewares: [
        express.static(path.join(process.cwd(), "uploads"), {
          setHeaders: (res) => {
            res.setHeader("X-Content-Type-Options", "nosniff")
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable")
          },
        }),
      ],
    },
  ],
})
