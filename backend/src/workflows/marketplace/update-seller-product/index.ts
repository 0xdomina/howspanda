import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { UpdateProductWorkflowInput } from "@medusajs/medusa/core-flows"
import {
  updateProductsWorkflow,
  updateInventoryLevelsWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

type WorkflowInput = {
  seller_admin_id: string
  product_id: string
  /**
   * Base fields to update (title / description / thumbnail / status).
   */
  update: {
    title?: string
    description?: string
    thumbnail?: string | null
    images?: { url: string }[]
    status?: "draft" | "published" | "archived"
    metadata?: Record<string, unknown>
  }
  /**
   * Optional per-variant updates, keyed by existing variant id. Each may
   * carry a new price and/or a new stock quantity (inventory level).
   */
  variants?: {
    id: string
    price?: number
    stock?: number
  }[]
}

/**
 * Confirm the product belongs to this seller's store (product -> seller link
 * is isList on the seller side, so we walk seller_admin -> seller ->
 * products). Missing link = not their product = unauthorized.
 */
const assertSellerOwnsProductStep = createStep(
  "assert-seller-owns-product",
  async ({ seller_admin_id, product_id }: {
    seller_admin_id: string
    product_id: string
  }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: admins } = await query.graph({
      entity: "seller_admin",
      fields: ["seller.products.id"],
      filters: { id: seller_admin_id },
    })
    const products = (admins[0]?.seller?.products ?? []) as {
      id: string
    }[]
    const owned = products.some((p) => p.id === product_id)
    if (!owned) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Product not found for this seller"
      )
    }
    return new StepResponse(true)
  }
)

const updateSellerProductWorkflow = createWorkflow(
  "update-seller-product",
  (input: WorkflowInput) => {
    assertSellerOwnsProductStep({
      seller_admin_id: input.seller_admin_id,
      product_id: input.product_id,
    })

    // Load the FULL current variant set (with prices + inventory items) so we
    // can merge requested updates and hand the complete list back to
    // updateProductsWorkflow — which syncs variants and would otherwise
    // delete any variant we omit.
    const { data: existingVariants } = useQueryGraphStep({
      entity: "product_variant",
      fields: [
        "id",
        "title",
        "sku",
        "options.*",
        "prices.*",
        "prices.currency_code.*",
        "inventory_items.inventory_item_id",
      ],
      filters: {
        product_id: input.product_id,
      },
    }).config({ name: "retrieve-existing-variants" })

    const mergedUpdate = transform({
      input,
      existingVariants,
    }, (data) => {
      const requested = new Map(
        (data.input.variants ?? []).map((v) => [v.id, v])
      )

      const variants = (data.existingVariants as any[]).map((v) => {
        const req = requested.get(v.id)
        const prices = v.prices?.map((p: any) => ({
          id: p.id,
          currency_code: p.currency_code?.code ?? "ngn",
          amount: req?.price ?? p.amount,
        }))

        return {
          id: v.id,
          title: v.title,
          sku: v.sku,
          prices: prices && prices.length ? prices : undefined,
        }
      })

      return {
        products: [
          {
            id: data.input.product_id,
            ...data.input.update,
            variants,
          },
        ],
      } as UpdateProductWorkflowInput
    })

    updateProductsWorkflow.runAsStep({
      input: mergedUpdate,
    })

    // Stock updates: match each requested variant to its inventory item and
    // update the level at the store's default location.
    const { data: stores } = useQueryGraphStep({
      entity: "store",
      fields: ["default_location_id"],
    })

    const { data: variants } = useQueryGraphStep({
      entity: "product_variant",
      fields: ["id", "inventory_items.inventory_item_id"],
      filters: {
        product_id: input.product_id,
      },
    }).config({ name: "retrieve-variants" })

    const stockUpdates = transform({
      input,
      stores,
      variants,
    }, (data) => {
      const locationId = data.stores[0]?.default_location_id
      if (!locationId) {
        return { updates: [] }
      }

      const requested = new Map(
        (data.input.variants ?? []).map((v) => [v.id, v])
      )
      const updates: {
        inventory_item_id: string
        location_id: string
        stocked_quantity: number
      }[] = []

      for (const variant of data.variants) {
        const req = requested.get(variant.id)
        if (!req || typeof req.stock !== "number") {
          continue
        }
        const inventoryItem = variant.inventory_items?.[0]?.inventory_item_id
        if (!inventoryItem) {
          continue
        }
        updates.push({
          inventory_item_id: inventoryItem,
          location_id: locationId,
          stocked_quantity: req.stock,
        })
      }
      return { updates }
    })

    updateInventoryLevelsWorkflow.runAsStep({
      input: stockUpdates,
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
        id: input.product_id,
      },
    }).config({ name: "retrieve-products" })

    return new WorkflowResponse({
      product: products[0],
    })
  }
)

export default updateSellerProductWorkflow
