import { CreateProductWorkflowInputDTO } from "@medusajs/framework/types"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createProductsWorkflow,
  CreateProductsWorkflowInput,
  createRemoteLinkStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import { Modules } from "@medusajs/framework/utils"

type WorkflowInput = {
  seller_admin_id: string
  product: CreateProductWorkflowInputDTO
  /** Optional per-variant stock quantities retained for the inventory step. */
  stocks?: (number | undefined)[]
}

const createSellerProductWorkflow = createWorkflow(
  "create-seller-product",
  (input: WorkflowInput) => {
    // make the product available in the store's default sales channel
    const { data: stores } = useQueryGraphStep({
      entity: "store",
      fields: ["default_sales_channel_id", "default_location_id"],
    })

    const productData = transform({
      input,
      stores,
    }, (data) => {
      return {
        products: [{
          ...data.input.product,
          sales_channels: [
            {
              id: data.stores[0].default_sales_channel_id,
            },
          ],
        }],
      }
    })

    const createdProducts = createProductsWorkflow.runAsStep({
      input: productData as CreateProductsWorkflowInput,
    })

    const { data: sellerAdmins } = useQueryGraphStep({
      entity: "seller_admin",
      fields: ["seller.id"],
      filters: {
        id: input.seller_admin_id,
      },
    }).config({ name: "retrieve-seller-admins" })

    const linksToCreate = transform({
      input,
      createdProducts,
      sellerAdmins,
    }, (data) => {
      return data.createdProducts.map((product) => {
        return {
          [MARKETPLACE_MODULE]: {
            seller_id: data.sellerAdmins[0].seller.id,
          },
          [Modules.PRODUCT]: {
            product_id: product.id,
          },
        }
      })
    })

    createRemoteLinkStep(linksToCreate)

    return new WorkflowResponse({
      product: createdProducts[0],
    })
  }
)

export default createSellerProductWorkflow
