import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, retrieveSellerProduct } from "@lib/data/seller"
import EditProduct from "@modules/seller/components/edit-product"

export const metadata: Metadata = {
  title: "Edit product",
  description: "Update a product in your store.",
}

export default async function EditProductPage({
  params,
}: {
  params: { id: string }
}) {
  const seller = await retrieveSeller().catch(() => null)

  if (!seller) {
    notFound()
  }

  const product = await retrieveSellerProduct(params.id).catch(() => null)

  if (!product) {
    notFound()
  }

  const variants = (product.variants ?? []).map((v: any) => ({
    id: v.id,
    title: v.title,
    price: v.prices?.[0]?.amount,
    stock: v.inventory_items?.[0]?.location_levels?.[0]?.stocked_quantity,
  }))

  return (
    <div data-testid="edit-product-page">
      <EditProduct
        productId={product.id}
        title={product.title}
        description={product.description}
        photo={product.thumbnail}
        variants={variants}
      />
    </div>
  )
}
