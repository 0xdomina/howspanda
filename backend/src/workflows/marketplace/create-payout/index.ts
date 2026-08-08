import { randomUUID } from "node:crypto"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import reserveCommissionLinesStep from "./steps/reserve-commission-lines"
import createPayoutRecordStep, {
  PayoutDestination,
} from "./steps/create-payout-record"
import initiatePayoutTransferStep from "./steps/initiate-payout-transfer"

export type CreatePayoutWorkflowInput = {
  seller_id: string
  rail: "paystack" | "crypto-usdc"
  idempotency_key: string
  requested_by: "seller" | "admin" | "schedule"
}

// Idempotency guard — checked FIRST, like the seller-order links check in
// create-seller-orders: a replayed key returns the existing payout untouched.
// Scoped to the seller so a key minted by one seller can never replay (or even
// observe) another seller's payout row.
const getExistingPayoutStep = createStep(
  "get-existing-payout",
  async (
    { seller_id, idempotency_key }: { seller_id: string; idempotency_key: string },
    { container }
  ) => {
    const marketplace: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    const [existing] = await marketplace.listPayouts({
      seller_id,
      idempotency_key,
    })
    return new StepResponse(existing ?? null)
  }
)

// Clear due pending lines, find the rail's default verified account, sweep
// the available NGN lines and enforce the payout minimum.
const preparePayoutStep = createStep(
  "prepare-payout",
  async (
    { seller_id, rail }: { seller_id: string; rail: string },
    { container }
  ) => {
    const marketplace: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    const accountType =
      rail === "paystack" ? "bank_account" : "crypto_address"
    const [account] = await marketplace.listPayoutAccounts({
      seller_id,
      type: accountType,
      status: "verified",
      is_default: true,
    })
    if (!account) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Seller has no default verified ${accountType} payout account for rail ${rail}`
      )
    }

    await marketplace.releaseDueLines()

    // negated clawback offset lines are `available` too, so they net out here
    const lines = await marketplace.listCommissionLines(
      { seller_id, status: "available", currency_code: "ngn" },
      { take: null }
    )
    const amount =
      Math.round(
        lines.reduce((sum, line) => sum + Number(line.net_amount), 0) * 100
      ) / 100

    const minimum = marketplace.payoutMinNgn()
    if (!lines.length || amount < minimum) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Available NGN balance (${amount}) is below the payout minimum (${minimum})`
      )
    }

    const destination: PayoutDestination =
      account.type === "bank_account"
        ? {
            type: "bank_account",
            bank_code: account.bank_code ?? undefined,
            account_number: account.account_number ?? undefined,
            account_name: account.account_name ?? undefined,
            recipient_code: account.recipient_code ?? undefined,
          }
        : {
            type: "crypto_address",
            network: account.network ?? undefined,
            address: account.address ?? undefined,
          }

    return new StepResponse({
      payout_id: `po_${randomUUID().replace(/-/g, "")}`,
      line_ids: lines.map((line) => line.id),
      amount,
      destination,
    })
  }
)

/**
 * Money-out workflow: idempotency guard → sweep+reserve → payout row →
 * hand to rail. Any step failure runs the compensations (lines released,
 * row deleted) so a failed attempt leaves zero payout rows and all balance
 * back in `available`.
 */
const createPayoutWorkflow = createWorkflow(
  "create-payout",
  (input: CreatePayoutWorkflowInput) => {
    const existing = getExistingPayoutStep({
      seller_id: input.seller_id,
      idempotency_key: input.idempotency_key,
    })

    const created = when(
      "payout-key-unused",
      { existing },
      (data) => !data.existing
    ).then(() => {
      const prep = preparePayoutStep({
        seller_id: input.seller_id,
        rail: input.rail,
      })

      reserveCommissionLinesStep({
        line_ids: prep.line_ids,
        payout_id: prep.payout_id,
      })

      createPayoutRecordStep({
        payout_id: prep.payout_id,
        seller_id: input.seller_id,
        amount: prep.amount,
        rail: input.rail,
        idempotency_key: input.idempotency_key,
        destination: prep.destination,
        requested_by: input.requested_by,
      })

      return initiatePayoutTransferStep({
        payout_id: prep.payout_id,
        rail: input.rail,
        amount: prep.amount,
        destination: prep.destination,
      })
    })

    const payout = transform({ existing, created }, (data) => {
      return data.existing ?? data.created
    })

    return new WorkflowResponse(payout)
  }
)

export default createPayoutWorkflow
