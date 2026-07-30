import { MedusaContainer } from "@medusajs/framework/types"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import createPayoutWorkflow from "../../../workflows/marketplace/create-payout"

export type ScheduledPayoutsResult = {
  attempted: number
  payouts: { seller_id: string; payout_id: string; status: string }[]
  skipped: { seller_id: string; reason: string }[]
  failures: { seller_id: string; reason: string }[]
}

/**
 * Sweep every eligible seller (or just the given one) into a payout run.
 * The idempotency key `sched-<seller_id>-<YYYYMMDD>` means one scheduled
 * payout per seller per day — replaying the cron the same day is a no-op
 * (the workflow's guard returns the existing payout untouched). Per-seller
 * failures are collected and never abort the run.
 */
export async function runScheduledPayouts(
  container: MedusaContainer,
  sellerId?: string,
  requestedBy: "schedule" | "admin" = "schedule"
): Promise<ScheduledPayoutsResult> {
  const marketplace =
    container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  await marketplace.clearPendingLines()

  const accounts = await marketplace.listPayoutAccounts(
    {
      status: "verified",
      is_default: true,
      ...(sellerId ? { seller_id: sellerId } : {}),
    },
    { take: null }
  )

  // one rail per seller — the bank rail wins when both types have a default
  const railBySeller = new Map<string, "paystack" | "crypto-usdc">()
  for (const account of accounts) {
    const rail =
      account.type === "bank_account" ? "paystack" : "crypto-usdc"
    const current = railBySeller.get(account.seller_id)
    if (!current || rail === "paystack") {
      railBySeller.set(account.seller_id, rail)
    }
  }

  const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const minimum = marketplace.payoutMinNgn()

  const result: ScheduledPayoutsResult = {
    attempted: 0,
    payouts: [],
    skipped: [],
    failures: [],
  }

  for (const [seller_id, rail] of railBySeller) {
    const balances = await marketplace.getSellerBalance(seller_id)
    const available = balances.ngn?.available ?? 0
    if (available < minimum) {
      result.skipped.push({
        seller_id,
        reason: `available NGN ${available} is below the payout minimum ${minimum}`,
      })
      continue
    }

    result.attempted += 1
    try {
      const { result: payout } = await createPayoutWorkflow(container).run({
        input: {
          seller_id,
          rail,
          idempotency_key: `sched-${seller_id}-${dayKey}`,
          requested_by: requestedBy,
        },
      })
      result.payouts.push({
        seller_id,
        payout_id: payout.id,
        status: payout.status,
      })
    } catch (error) {
      result.failures.push({
        seller_id,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}
