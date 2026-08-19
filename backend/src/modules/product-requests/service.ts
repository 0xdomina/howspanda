import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import ProductRequest, {
  PRODUCT_REQUEST_STATUSES,
} from "./models/product-request"

export type ProductRequestStatus = (typeof PRODUCT_REQUEST_STATUSES)[number]

class ProductRequestsModuleService extends MedusaService({ ProductRequest }) {
  async createBuyerRequest(input: {
    customerId: string
    buyerEmail: string
    sellerId: string
    request: string
  }) {
    const text = input.request.trim()
    if (!text || text.length > 100) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Tell the store what you need in 100 characters or less"
      )
    }

    const existing = await this.listProductRequests(
      {
        customer_id: input.customerId,
        seller_id: input.sellerId,
        request: text,
        status: { $in: ["open", "reviewing"] },
      },
      { order: { created_at: "DESC" }, take: 1 }
    )
    if (existing[0]) return { request: existing[0], duplicate: true }

    const request = await this.createProductRequests({
      customer_id: input.customerId,
      buyer_email: input.buyerEmail.trim().toLowerCase(),
      seller_id: input.sellerId,
      request: text,
      status: "open",
      seller_note: null,
      product_id: null,
      responded_at: null,
    })
    return { request, duplicate: false }
  }

  async listForBuyer(customerId: string) {
    return this.listProductRequests(
      { customer_id: customerId },
      { order: { created_at: "DESC" } }
    )
  }

  async listForSeller(sellerId: string) {
    return this.listProductRequests(
      { seller_id: sellerId },
      { order: { created_at: "DESC" } }
    )
  }

  async updateForSeller(
    requestId: string,
    sellerId: string,
    input: {
      status: Exclude<ProductRequestStatus, "open">
      sellerNote?: string | null
      productId?: string | null
    }
  ) {
    const [request] = await this.listProductRequests({ id: requestId, seller_id: sellerId })
    if (!request) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Request not found")
    }
    if (input.status === "available" && !input.productId && !request.product_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Choose the product that is now available before marking this request available"
      )
    }

    const updated = await this.updateProductRequests({
      id: request.id,
      status: input.status,
      seller_note: input.sellerNote?.trim() || null,
      product_id: input.productId ?? request.product_id ?? null,
      responded_at: new Date(),
    })
    return updated
  }
}

export default ProductRequestsModuleService
