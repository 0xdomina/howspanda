import { createHmac, timingSafeEqual } from "node:crypto"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { BUYER_WALLET_MODULE } from "../../../../modules/buyer-wallet"
import BuyerWalletModuleService from "../../../../modules/buyer-wallet/service"
import { isMockMode } from "../../../../lib/payments/payouts/paystack-transfers"

type TransferWebhookBody = {
  event?: string
  data?: {
    reference?: string
    reason?: string
  }
}

// HMAC-SHA512 of the exact raw bytes, timing-safe — same pattern as the
// Phase 4 paystack payment provider's isValidSignature.
function isValidSignature(
  rawBody: string | Buffer | undefined,
  signature: unknown
): boolean {
  if (!signature || typeof signature !== "string") {
    return false
  }

  const body =
    typeof rawBody === "string"
      ? rawBody
      : rawBody
        ? rawBody.toString("utf8")
        : ""

  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY ?? "")
    .update(body)
    .digest("hex")

  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

// A NOT_FOUND means the reference is permanently unknown to us (a replay, a
// foreign webhook, or an event for a record we never created) — ack it so the
// gateway stops retrying. Anything else (DB down, provider hiccup, etc.) is
// transient: return 500 so Paystack retries and reconcile acts as the
// safety net for anything still missed.
function isNotFound(err: unknown): boolean {
  return (
    err instanceof MedusaError && err.type === MedusaError.Types.NOT_FOUND
  )
}

/**
 * Paystack transfer webhook — the transfer reference IS the payout id or the
 * buyer-withdrawal id (distinguished by the `po_`/`bw_` prefix), so each event
 * maps straight onto a record transition.
 *
 * Reliability contract (Phase 15 webhook pass):
 *  - invalid signature → 401 (never processed, gateway should not retry)
 *  - unknown event type / unknown reference → 200 ack (permanent, reconcile
 *    settles anything that later becomes knowable)
 *  - transient processing failure → 500 so Paystack retries
 *  - idempotent transitions mean a redelivered verdict is a safe no-op
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  if (!isMockMode()) {
    const rawBody = (req as MedusaRequest & { rawBody?: string | Buffer })
      .rawBody
    if (!isValidSignature(rawBody, req.headers["x-paystack-signature"])) {
      logger.warn("payout-webhook.invalid_signature")
      res.status(401).json({ message: "Invalid signature" })
      return
    }
  }

  const body = (req.body ?? {}) as TransferWebhookBody
  const event = String(body.event ?? "")
  const reference = String(body.data?.reference ?? "")

  // Events we don't act on (charge.success, transfer.on_hold, ...) are
  // acknowledged without touching any record — the gateway stops here.
  if (
    event !== "transfer.success" &&
    event !== "transfer.failed" &&
    event !== "transfer.reversed"
  ) {
    logger.info(
      `payout-webhook.ignored_event event=${event} reference=${reference}`
    )
    res.json({ received: true })
    return
  }

  try {
    if (reference.startsWith("bw_")) {
      const buyerWallet = req.scope.resolve<BuyerWalletModuleService>(
        BUYER_WALLET_MODULE
      )
      if (event === "transfer.success") {
        await buyerWallet.markBuyerWithdrawalPaid(reference)
      } else if (event === "transfer.failed") {
        await buyerWallet.markBuyerWithdrawalFailed(
          reference,
          String(body.data?.reason ?? "transfer failed")
        )
      } else if (event === "transfer.reversed") {
        await buyerWallet.markBuyerWithdrawalReversed(reference)
      }
    } else {
      const marketplace =
        req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
      if (event === "transfer.success") {
        await marketplace.markPayoutPaid(reference)
      } else if (event === "transfer.failed") {
        await marketplace.markPayoutFailed(
          reference,
          String(body.data?.reason ?? "transfer failed")
        )
      } else if (event === "transfer.reversed") {
        await marketplace.markPayoutReversed(reference)
      }
    }

    logger.info(
      `payout-webhook.processed event=${event} reference=${reference}`
    )
  } catch (err) {
    if (isNotFound(err)) {
      // Permanent: the reference is not one of ours (replay/foreign). Ack so
      // the gateway stops retrying; reconcile settles anything still pending.
      logger.info(
        `payout-webhook.unknown_reference event=${event} reference=${reference}`
      )
      res.json({ received: true })
      return
    }

    // Transient — tell Paystack to retry. Reconcile remains the safety net.
    logger.error(
      `payout-webhook.transient_error event=${event} reference=${reference}`,
      err instanceof Error ? err : new Error(String(err))
    )
    res.status(500).json({ message: "Webhook processing failed" })
    return
  }

  res.json({ received: true })
}
