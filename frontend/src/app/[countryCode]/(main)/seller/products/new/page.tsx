import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller } from "@lib/data/seller"
import { listCategories } from "@lib/data/categories"
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

  const categories = await listCategories({ limit: 100 }).catch(() => [])

  return (
    <div data-testid="new-product-page">
      <AddProduct
        showVideo={true}
        categories={(categories ?? []).map((c) => ({
          id: c.id,
          name: c.name,
        }))}
      />
    </div>
  )
}
