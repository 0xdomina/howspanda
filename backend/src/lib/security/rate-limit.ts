import { NextFunction } from "express"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { ICacheService } from "@medusajs/framework/types"
import type { Logger } from "@medusajs/framework/types"
import { createHash } from "crypto"

export type RateLimitConfig = {
  // Maximum requests allowed within `windowMs`.
  limit: number
  windowMs: number
  // Bucket name on top of the per-IP key so one route can register multiple
  // independent limits without colliding.
  name: string
  /**
   * Default clients are keyed by remote IP. Override when a more stable
   * identifier is available (e.g. the request body already carries the actor's
   * email) so NAT'd users behind a shared IP are not throttled together.
   */
  keyOf?: (req: MedusaRequest) => string | undefined
}

const CACHE_KEY_PREFIX = "rate-limit:"

/**
 * Fixed-window rate limiter backed by the container's cache module (Redis in
 * production via `@medusajs/medusa/cache-redis`, in-memory otherwise), so no
 * extra dependency is needed and limits are shared across app instances when a
 * distributed cache is configured. Apply only to sensitive routes: auth/OTP,
 * referrals, wallet withdrawals, checkout, admin. Webhooks are exempt by
 * design — provider retries must never be throttled.
 *
 * Counting is a small non-atomic read-modify-write over get/set, which is
 * acceptable for abuse throttling (a burst may share a few window "borrows").
 * Production fails closed when the distributed cache is unavailable. Allowing
 * sensitive routes through during a cache outage turns an infrastructure
 * incident into an abuse window.
 *
 * Runtime overrides (no rebuild needed):
 *  - RATE_LIMIT_ENABLED=false disables all limits (integration test env).
 *  - RATE_LIMIT_<NAME>_LIMIT / RATE_LIMIT_<NAME>_WINDOW_MS tune a bucket.
 */
export function rateLimit(config: RateLimitConfig) {
  return async (
    req: MedusaRequest,
    res: MedusaResponse,
    next: NextFunction
  ) => {
    const decision = await evaluate(req, config)
    if (decision.unavailable) {
      res.status(503).json({
        message: "This action is temporarily unavailable. Please try again shortly.",
      })
      return
    }
    if (decision.throttled) {
      res.status(429).json({
        message: "Too many requests, please try again shortly.",
        retry_after_seconds: Math.ceil(decision.windowMs / 1000),
      })
      return
    }
    next()
  }
}

async function evaluate(
  req: MedusaRequest,
  config: RateLimitConfig
): Promise<{ throttled: boolean; windowMs: number; unavailable?: boolean }> {
  if (process.env.RATE_LIMIT_ENABLED === "false") {
    return { throttled: false, windowMs: config.windowMs }
  }
  const nameUpper = config.name.toUpperCase().replace(/[^A-Z0-9]/g, "_")
  const envLimit = Number(process.env[`RATE_LIMIT_${nameUpper}_LIMIT`])
  const envWindow = Number(process.env[`RATE_LIMIT_${nameUpper}_WINDOW_MS`])
  const limit = Number.isFinite(envLimit) ? envLimit : config.limit
  const windowMs = Number.isFinite(envWindow) ? envWindow : config.windowMs

  const cache = req.scope.resolve<ICacheService>(Modules.CACHE, {
    allowUnregistered: true,
  })
  if (!cache) {
    req.scope
      .resolve<Logger>(ContainerRegistrationKeys.LOGGER, {
        allowUnregistered: true,
      })
      ?.error("rate-limit: no cache module registered")
    return {
      throttled: false,
      unavailable: process.env.NODE_ENV === "production",
      windowMs,
    }
  }

  // Express derives req.ip from the configured proxy trust chain. Never trust
  // a user-supplied x-forwarded-for value directly; doing so lets an attacker
  // mint a new bucket on every request.
  const ipKey = (req as any).ip || req.socket?.remoteAddress || "unknown"
  const customKey = config.keyOf?.(req)
  const identity = `${customKey ?? ""}|${ipKey}`
  const digest = createHash("sha256").update(identity).digest("hex")
  const bucketKey = `${CACHE_KEY_PREFIX}${config.name}:${digest}:${Math.floor(
    Date.now() / windowMs
  )}`

  const current = (await cache.get(bucketKey)) as number | undefined
  if (typeof current === "number" && current >= limit) {
    return { throttled: true, windowMs }
  }

  await cache.set(bucketKey, (current ?? 0) + 1, Math.ceil(windowMs / 1000))
  return { throttled: false, windowMs }
}
