import { createHmac, timingSafeEqual } from "node:crypto"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
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

/**
 * Paystack transfer webhook — the transfer reference IS the payout id, so
 * each event maps straight onto a payout transition. Unknown events and
 * unknown references are acked with 200 (never 500 to the gateway);
 * reconcile picks up anything a webhook misses.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  if (!isMockMode()) {
    const rawBody = (req as MedusaRequest & { rawBody?: string | Buffer })
      .rawBody
    if (!isValidSignature(rawBody, req.headers["x-paystack-signature"])) {
      res.status(401).json({ message: "Invalid signature" })
      return
    }
  }

  const body = (req.body ?? {}) as TransferWebhookBody
  const event = String(body.event ?? "")
  const reference = String(body.data?.reference ?? "")

  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  try {
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
  } catch {
    // unknown reference or bad state — ack anyway, reconcile will settle it
  }

  res.json({ received: true })
}
