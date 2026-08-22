import { CreateProductWorkflowInputDTO } from "@medusajs/framework/types"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createProductsWorkflow,
  CreateProductsWorkflowInput,
  createInventoryLevelsWorkflow,
  createRemoteLinkStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import { Modules } from "@medusajs/framework/utils"

type WorkflowInput = {
  seller_admin_id: string
  product: CreateProductWorkflowInputDTO
  /**
   * Optional per-variant stock quantities, aligned by index with
   * `product.variants`. A variant with a stock value gets a real inventory
   * level at the store's default location; a variant without one is listed
   * but not stocked (available = 0 until the seller adds stock later).
   */
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

    // Store defaults are not guaranteed to exist on older or manually-created
    // stores. Keep product creation usable by falling back to the first active
    // sales channel instead of sending an invalid `{ id: undefined }` link to
    // the Medusa product workflow.
    const { data: salesChannels } = useQueryGraphStep({
      entity: "sales_channel",
      fields: ["id", "is_disabled"],
      filters: { is_disabled: false },
    }).config({ name: "retrieve-active-sales-channel" })

    const productData = transform({
      input,
      stores,
      salesChannels,
    }, (data) => {
      const store = data.stores[0]
      const salesChannelId =
        store?.default_sales_channel_id ?? data.salesChannels[0]?.id
      const product = {
        ...data.input.product,
        ...(salesChannelId ? { sales_channels: [{ id: salesChannelId }] } : {}),
      }

      return {
        products: [product],
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

    // Stock: give each stocked variant a real inventory level at the store's
    // default location. The product workflow auto-creates one inventory item
    // per manage_inventory variant; we add the level (stocked_quantity).
    const { data: createdVariants } = useQueryGraphStep({
      entity: "product_variant",
      fields: ["id", "inventory_items.inventory_item_id"],
      filters: {
        product_id: createdProducts[0].id,
      },
    }).config({ name: "retrieve-created-variants" })

    const inventoryLevels = transform({
      input,
      stores,
      createdVariants,
    }, (data) => {
      const locationId = data.stores[0]?.default_location_id
      if (!locationId) {
        return { inventory_levels: [] }
      }

      const levels: {
        inventory_item_id: string
        location_id: string
        stocked_quantity: number
      }[] = []
      for (const [index, variant] of data.createdVariants.entries()) {
        const stock = data.input.stocks?.[index]
        if (typeof stock !== "number" || stock < 0) {
          continue
        }
        const inventoryItem = variant.inventory_items?.[0]?.inventory_item_id
        if (!inventoryItem) {
          continue
        }
        levels.push({
          inventory_item_id: inventoryItem,
          location_id: locationId,
          stocked_quantity: stock,
        })
      }
      return { inventory_levels: levels }
    })

    createInventoryLevelsWorkflow.runAsStep({
      input: inventoryLevels,
    })

    const { data: products } = useQueryGraphStep({
      entity: "product",
      fields: [
        "*",
        "variants.*",
        "variants.options.*",
        "variants.prices.*",
        "variants.prices.currency_code.*",
        "images.*",
        "options.*",
        "options.values.*",
      ],
      filters: {
        id: createdProducts[0].id,
      },
    }).config({ name: "retrieve-products" })

    return new WorkflowResponse({
      product: products[0],
    })
  }
)

export default createSellerProductWorkflow
