import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  CartLineItemDTO,
  OrderDTO,
  LinkDefinition,
  InferTypeOf,
} from "@medusajs/framework/types"
import { Modules, promiseAll } from "@medusajs/framework/utils"
import {
  cancelOrderWorkflow,
  createOrderWorkflow,
} from "@medusajs/medusa/core-flows"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import Seller from "../../../../modules/marketplace/models/seller"

export type SellerOrder = (OrderDTO & {
  seller: InferTypeOf<typeof Seller>
})

type StepInput = {
  parentOrder: OrderDTO
  sellersItems: Record<string, CartLineItemDTO[]>
  ungroupedItemCount: number
}

function prepareOrderData(
  items: CartLineItemDTO[],
  parentOrder: OrderDTO
) {
  return {
    items,
    metadata: {
      parent_order_id: parentOrder.id,
    },
    // inherit everything else from the parent order
    region_id: parentOrder.region_id,
    customer_id: parentOrder.customer_id,
    sales_channel_id: parentOrder.sales_channel_id,
    email: parentOrder.email,
    currency_code: parentOrder.currency_code,
    shipping_address_id: parentOrder.shipping_address?.id,
    billing_address_id: parentOrder.billing_address?.id,
    // for simplicity the parent's shipping method is copied to each
    // child order; per-seller shipping comes later
    shipping_methods: parentOrder.shipping_methods?.map((shippingMethod) => ({
      name: shippingMethod.name,
      amount: shippingMethod.amount,
      shipping_option_id: shippingMethod.shipping_option_id,
      data: shippingMethod.data,
      tax_lines: shippingMethod.tax_lines?.map((taxLine) => ({
        code: taxLine.code,
        rate: taxLine.rate,
        provider_id: taxLine.provider_id,
        tax_rate_id: taxLine.tax_rate_id,
        description: taxLine.description,
      })),
      adjustments: shippingMethod.adjustments?.map((adjustment) => ({
        code: adjustment.code,
        amount: adjustment.amount,
        description: adjustment.description,
        promotion_id: adjustment.promotion_id,
        provider_id: adjustment.provider_id,
      })),
    })),
  }
}

const createSellerOrdersStep = createStep(
  "create-seller-orders",
  async (
    { sellersItems, parentOrder, ungroupedItemCount }: StepInput,
    { container, context }
  ) => {
    const linkDefs: LinkDefinition[] = []
    const createdOrders: SellerOrder[] = []
    const sellerIds = Object.keys(sellersItems)

    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    const sellers = await marketplaceModuleService.listSellers({
      id: sellerIds,
    })

    // shortcut only applies when the seller owns ALL cart items
    if (sellerIds.length === 1 && ungroupedItemCount === 0) {
      // single-seller cart: the parent order IS the seller order
      linkDefs.push({
        [MARKETPLACE_MODULE]: {
          seller_id: sellers[0].id,
        },
        [Modules.ORDER]: {
          order_id: parentOrder.id,
        },
      })

      createdOrders.push({
        ...parentOrder,
        seller: sellers[0],
      })

      return new StepResponse({
        orders: createdOrders,
        linkDefs,
      }, {
        created_orders: [],
      })
    }

    try {
      await promiseAll(
        sellerIds.map(async (sellerId) => {
          const items = sellersItems[sellerId]
          const seller = sellers.find((s) => s.id === sellerId)!

          const { result: childOrder } = await createOrderWorkflow(
            container
          )
            .run({
              input: prepareOrderData(items, parentOrder),
              context,
            }) as unknown as { result: SellerOrder }

          childOrder.seller = seller
          createdOrders.push(childOrder)

          linkDefs.push({
            [MARKETPLACE_MODULE]: {
              seller_id: seller.id,
            },
            [Modules.ORDER]: {
              order_id: childOrder.id,
            },
          })
        })
      )
    } catch (e) {
      return StepResponse.permanentFailure(
        `An error occurred while creating seller orders: ${e}`,
        {
          created_orders: createdOrders,
        }
      )
    }

    return new StepResponse({
      orders: createdOrders,
      linkDefs,
    }, {
      created_orders: createdOrders,
    })
  },
  async (data, { container, context }) => {
    if (!data) {
      return
    }
    await promiseAll(data.created_orders.map((createdOrder) => {
      return cancelOrderWorkflow(container).run({
        input: {
          order_id: createdOrder.id,
        },
        context,
        container,
      })
    }))
  }
)

export default createSellerOrdersStep
