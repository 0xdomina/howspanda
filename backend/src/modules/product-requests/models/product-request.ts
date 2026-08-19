import { model } from "@medusajs/framework/utils"

export const PRODUCT_REQUEST_STATUSES = [
  "open",
  "reviewing",
  "available",
  "not_available",
  "closed",
] as const

const ProductRequest = model.define("product_request", {
  id: model.id().primaryKey(),
  customer_id: model.text().searchable(),
  buyer_email: model.text().searchable(),
  seller_id: model.text().searchable(),
  request: model.text(),
  status: model.enum([...PRODUCT_REQUEST_STATUSES]),
  seller_note: model.text().nullable(),
  product_id: model.text().nullable(),
  responded_at: model.dateTime().nullable(),
})

export default ProductRequest
