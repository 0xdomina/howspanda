import { MedusaContainer } from "@medusajs/framework/types"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { getCryptoSettlement } from "../crypto"
import { verifyTransfer } from "./paystack-transfers"

export type ReconcileSummary = {
  checked: number
  paid: number
  failed: number
}

/**
 * Poll the rail for ONE payout and apply the provider's verdict via the
 * idempotent transition methods. The provider reference is always the payout
 * id, so replays can never double-pay. A payout that stays `processing` is
 * simply retried next run — provider verdicts only, no time-based failure.
 */
export async function reconcilePayout(
  container: MedusaContainer,
  payoutId: string
) {
  const marketplace =
    container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const payout = await marketplace.retrievePayout(payoutId)

  if (payout.status !== "processing") {
    return payout
  }

  await marketplace.updatePayouts([
    { id: payout.id, attempts: Number(payout.attempts ?? 0) + 1 },
  ])

  if (payout.rail === "paystack") {
    const verification = await verifyTransfer(payout.id)
    if (verification.status === "success") {
      await marketplace.markPayoutPaid(payout.id)
    } else if (verification.status === "failed") {
      await marketplace.markPayoutFailed(
        payout.id,
        verification.failure_reason ?? "transfer failed"
      )
    } else if (verification.status === "reversed") {
      await marketplace.markPayoutReversed(payout.id)
    }
  } else {
    const destination = payout.destination as { network?: string } | null
    const settlement = getCryptoSettlement(destination?.network)
    const withdrawal = await settlement.checkWithdrawal(payout.id)
    if (withdrawal.status === "confirmed") {
      await marketplace.markPayoutPaid(payout.id)
    } else if (withdrawal.status === "failed") {
      await marketplace.markPayoutFailed(
        payout.id,
        "on-chain withdrawal failed"
      )
    }
  }

  return await marketplace.retrievePayout(payout.id)
}

/**
 * Sweep every `processing` payout through reconcilePayout. Per-payout rail
 * errors are swallowed (the payout stays processing and is retried next run).
 */
export async function reconcilePayouts(
  container: MedusaContainer
): Promise<ReconcileSummary> {
  const marketplace =
    container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const processing = await marketplace.listPayouts(
    { status: "processing" },
    { take: null }
  )

  const summary: ReconcileSummary = { checked: 0, paid: 0, failed: 0 }

  for (const payout of processing) {
    summary.checked += 1
    try {
      const updated = await reconcilePayout(container, payout.id)
      if (updated.status === "paid") {
        summary.paid += 1
      } else if (
        updated.status === "failed" ||
        updated.status === "reversed"
      ) {
        summary.failed += 1
      }
    } catch {
      // rail hiccup — leave it processing, next run retries
    }
  }

  return summary
}
