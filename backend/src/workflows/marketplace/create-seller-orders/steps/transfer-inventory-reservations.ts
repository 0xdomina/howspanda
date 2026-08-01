import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { SellerOrder } from "./create-seller-orders"

type StepInput = {
  parentOrderId: string
  sellerOrders: SellerOrder[]
}

/** The order-item fields this step needs, matched across parent + child. */
type LineItemLite = {
  id: string
  variant_id: string | null
  quantity: number
}

/** Shape of a `query.graph` order row narrowed to what this step reads. */
type OrderRow = {
  id: string
  items: (LineItemLite | null)[]
}

/**
 * One inventory reservation row re-attributed from a parent order line item
 * to the matching child seller-order line item (keyed by variant_id +
 * quantity, since both are derived from the same cart line item).
 */
export type ReservationTransfer = {
  reservationId: string
  fromLineItemId: string
  toLineItemId: string
}

/**
 * Medusa's `completeCartWorkflow` reserves inventory against the PARENT
 * order's line items, but `createOrderWorkflow` (which builds the child seller
 * orders) never creates reservations — it only validates availability. Since
 * each seller fulfils their OWN child order, fulfillment could not find a
 * reservation and failed for `manage_inventory` items.
 *
 * This step hands the parent's reservations down to the child order line items
 * (the parent itself is never fulfilled in the marketplace model), so stock is
 * neither double-reserved nor stranded. Compensation restores every
 * reservation to its original parent line item on a downstream failure.
 */
const transferInventoryReservationsStep = createStep(
  "transfer-inventory-reservations",
  async ({ parentOrderId, sellerOrders }: StepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const inventory = container.resolve(Modules.INVENTORY)

    // Only genuine child orders need the transfer; the single-seller shortcut
    // reuses the parent order, which already owns its reservations.
    const childOrders = sellerOrders.filter((o) => o.id !== parentOrderId)
    if (!childOrders.length) {
      return new StepResponse([], [])
    }

    const { data: parentOrders } = (await query.graph({
      entity: "order",
      fields: ["id", "items.id", "items.variant_id", "items.quantity"],
      filters: { id: parentOrderId },
    })) as unknown as { data: OrderRow[] }
    const parentItems = (parentOrders[0]?.items ?? []).filter(
      (i): i is LineItemLite => !!i
    )

    const parentLineItemIds = parentItems.map((i) => i.id)
    if (!parentLineItemIds.length) {
      return new StepResponse([], [])
    }

    // Reservations created at cart completion, keyed by the parent line item
    // they were reserved against.
    const reservations = await inventory.listReservationItems({
      line_item_id: parentLineItemIds,
    })
    if (!reservations.length) {
      return new StepResponse([], [])
    }

    const parentItemById = new Map(parentItems.map((i) => [i.id, i]))

    const transfers: ReservationTransfer[] = []
    // Pool of parent reservations still waiting to be handed off.
    const pool = [...reservations]

    for (const child of childOrders) {
      const { data: childOrderRows } = (await query.graph({
        entity: "order",
        fields: ["id", "items.id", "items.variant_id", "items.quantity"],
        filters: { id: child.id },
      })) as unknown as { data: OrderRow[] }
      const childItems = (childOrderRows[0]?.items ?? []).filter(
        (i): i is LineItemLite => !!i
      )

      for (const item of childItems) {
        // Greedy 1:1 match on the shared (variant_id, quantity) key so that
        // duplicate identical lines still pair up correctly.
        const matchIdx = pool.findIndex((r) => {
          if (!r.line_item_id) {
            return false
          }
          const parentItem = parentItemById.get(r.line_item_id)
          return (
            !!parentItem &&
            !!item.variant_id &&
            parentItem.variant_id === item.variant_id &&
            Number(parentItem.quantity) === Number(item.quantity)
          )
        })
        if (matchIdx === -1) {
          continue
        }
        const reservation = pool[matchIdx]
        pool.splice(matchIdx, 1)
        if (!reservation.line_item_id) {
          continue
        }
        transfers.push({
          reservationId: reservation.id,
          fromLineItemId: reservation.line_item_id,
          toLineItemId: item.id,
        })
      }
    }

    if (!transfers.length) {
      return new StepResponse([], [])
    }

    await inventory.updateReservationItems(
      transfers.map((t) => ({
        id: t.reservationId,
        line_item_id: t.toLineItemId,
      }))
    )

    return new StepResponse(transfers, transfers)
  },
  async (transfers: ReservationTransfer[] | undefined, { container }) => {
    if (!transfers?.length) {
      return
    }
    const inventory = container.resolve(Modules.INVENTORY)
    // Put every reservation back on its original parent line item so a later
    // failure leaves the system exactly as it was before this step ran.
    await inventory.updateReservationItems(
      transfers.map((t) => ({
        id: t.reservationId,
        line_item_id: t.fromLineItemId,
      }))
    )
  }
)

export default transferInventoryReservationsStep
