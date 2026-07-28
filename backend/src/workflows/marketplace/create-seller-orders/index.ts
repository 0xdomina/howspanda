import {
  createWorkflow,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  useQueryGraphStep,
  createRemoteLinkStep,
  completeCartWorkflow,
  getOrderDetailWorkflow,
  acquireLockStep,
  releaseLockStep,
} from "@medusajs/medusa/core-flows"
import groupSellerItemsStep, {
  GroupSellerItemsStepInput,
} from "./steps/group-seller-items"
import createSellerOrdersStep from "./steps/create-seller-orders"
import createCommissionLinesStep from "./steps/create-commission-lines"
import sellerOrderLink from "../../../links/seller-order"

type WorkflowInput = {
  cart_id: string
}

const createSellerOrdersWorkflow = createWorkflow(
  "create-seller-orders",
  (input: WorkflowInput) => {
    const { data: carts } = useQueryGraphStep({
      entity: "cart",
      fields: ["id", "items.*"],
      filters: { id: input.cart_id },
      options: {
        throwIfKeyNotFound: true,
      },
    })

    // The lock TTL must outlive the worst-case cart-completion + splitting
    // duration (payment provider calls included).
    acquireLockStep({
      key: input.cart_id,
      timeout: 2,
      ttl: 120,
    })

    const { id: orderId } = completeCartWorkflow.runAsStep({
      input: {
        id: carts[0].id,
      },
    })

    // idempotency: if links already exist, this cart was already split
    const { data: existingLinks } = useQueryGraphStep({
      entity: sellerOrderLink.entryPoint,
      fields: ["seller.id"],
      filters: { order_id: orderId },
    }).config({ name: "retrieve-existing-links" })

    const order = getOrderDetailWorkflow.runAsStep({
      input: {
        order_id: orderId,
        fields: [
          "region_id",
          "customer_id",
          "sales_channel_id",
          "email",
          "currency_code",
          "shipping_address.*",
          "billing_address.*",
          "shipping_methods.*",
          "shipping_methods.tax_lines.*",
          "shipping_methods.adjustments.*",
        ],
      },
    })

    const sellerOrders = when(
      "create-seller-order-links",
      { existingLinks },
      (data) => data.existingLinks.length === 0
    ).then(() => {
      const { sellersItems, ungroupedItemCount } = groupSellerItemsStep({
        cart: carts[0],
      } as unknown as GroupSellerItemsStepInput)

      const {
        orders: sellerOrders,
        linkDefs,
      } = createSellerOrdersStep({
        parentOrder: order,
        sellersItems,
        ungroupedItemCount,
      })

      // The seller<->order links are the idempotency marker for the split
      // (checked as `existingLinks` above), so they must be written last —
      // a crash before them causes a full retry instead of a silent ledger gap.
      createCommissionLinesStep({
        orders: sellerOrders,
      })

      createRemoteLinkStep(linkDefs)

      return sellerOrders
    })

    releaseLockStep({
      key: input.cart_id,
    })

    return new WorkflowResponse({
      order,
      sellerOrders,
    })
  }
)

export default createSellerOrdersWorkflow
