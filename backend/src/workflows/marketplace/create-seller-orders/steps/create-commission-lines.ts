import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import { SellerOrder } from "./create-seller-orders"
import { computeCommission } from "../../../../lib/marketplace/commission"

type StepInput = {
  orders: SellerOrder[]
}

const createCommissionLinesStep = createStep(
  "create-commission-lines",
  async ({ orders }: StepInput, { container }) => {
    if (!orders?.length) {
      return new StepResponse([], [])
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    // fetch computed totals for each seller order
    const { data: orderTotals } = await query.graph({
      entity: "order",
      fields: ["id", "total", "currency_code"],
      filters: {
        id: orders.map((order) => order.id),
      },
    })

    const linesData = orders.map((order) => {
      const totals = orderTotals.find((o) => o.id === order.id)!
      const total = Number(totals.total)
      // Tiered volume discount by default; a per-seller override
      // (seller.commission_rate) wins when explicitly set.
      const { rate, commission, net } = computeCommission(
        total,
        order.seller.commission_rate
      )

      return {
        order_id: order.id,
        // child orders stamp metadata.parent_order_id; single-seller carts
        // reuse the parent order, so the parent IS the seller order
        parent_order_id:
          (order.metadata?.parent_order_id as string | undefined) ?? order.id,
        currency_code: totals.currency_code,
        order_total: total,
        rate,
        commission_amount: commission,
        net_amount: net,
        seller_id: order.seller.id,
      }
    })

    const lines = await marketplaceModuleService.createCommissionLines(
      linesData
    )

    return new StepResponse(lines, lines.map((line) => line.id))
  },
  async (lineIds, { container }) => {
    if (!lineIds?.length) {
      return
    }

    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    await marketplaceModuleService.deleteCommissionLines(lineIds)
  }
)

export default createCommissionLinesStep
