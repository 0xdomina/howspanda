import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller } from "@lib/data/seller"
import { sellerHasPermission } from "@lib/seller-permissions"
import AddProduct from "@modules/seller/components/add-product"

export const metadata: Metadata = {
  title: "Add a product",
  description: "List a new product in your store.",
}

export default async function NewProductPage() {
  const seller = await retrieveSeller().catch(() => null)

  if (!seller || !sellerHasPermission(seller, "products")) {
    notFound()
  }

  return (
    <div data-testid="new-product-page">
      <AddProduct showVideo={true} />
    </div>
  )
}
