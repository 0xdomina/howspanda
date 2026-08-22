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
    // Keep the creation transaction independent of optional store defaults.
    // Sales-channel assignment is not required for the product entity itself
    // and older stores may not have a readable default channel.
    const productData = transform({ input }, (data) => ({
      products: [data.input.product],
    }))

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
