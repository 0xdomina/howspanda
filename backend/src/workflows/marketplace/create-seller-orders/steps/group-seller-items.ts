import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { CartLineItemDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, promiseAll } from "@medusajs/framework/utils"

export type GroupSellerItemsStepInput = {
  cart: {
    items?: CartLineItemDTO[]
  }
}

const groupSellerItemsStep = createStep(
  "group-seller-items",
  async ({ cart }: GroupSellerItemsStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const sellersItems: Record<string, CartLineItemDTO[]> = {}

    await promiseAll((cart.items || []).map(async (item) => {
      const { data: [product] } = await query.graph({
        entity: "product",
        fields: ["seller.*"],
        filters: {
          id: item.product_id || "",
        },
      })

      const sellerId = product.seller?.id

      if (!sellerId) {
        return
      }
      sellersItems[sellerId] = [
        ...(sellersItems[sellerId] || []),
        item,
      ]
    }))

    return new StepResponse({
      sellersItems,
    })
  }
)

export default groupSellerItemsStep
