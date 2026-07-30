import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"

type StepInput = {
  line_ids: string[]
  payout_id: string
}

/**
 * Flip the swept lines `available → reserved` and stamp them with the payout
 * id. Compensation releases them back to `available` so a failed transfer
 * never strands balance.
 */
const reserveCommissionLinesStep = createStep(
  "reserve-commission-lines",
  async ({ line_ids, payout_id }: StepInput, { container }) => {
    const marketplace: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    await marketplace.updateCommissionLines(
      line_ids.map((id) => ({
        id,
        status: "reserved" as const,
        payout_id,
      }))
    )

    return new StepResponse(line_ids, line_ids)
  },
  async (lineIds, { container }) => {
    if (!lineIds?.length) {
      return
    }

    const marketplace: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    await marketplace.updateCommissionLines(
      lineIds.map((id) => ({
        id,
        status: "available" as const,
        payout_id: null,
      }))
    )
  }
)

export default reserveCommissionLinesStep
