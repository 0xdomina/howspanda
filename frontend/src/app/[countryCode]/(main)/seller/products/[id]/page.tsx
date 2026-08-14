import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, retrieveSellerProduct } from "@lib/data/seller"
import EditProduct from "@modules/seller/components/edit-product"
import { sellerHasPermission } from "@lib/seller-permissions"

export const metadata: Metadata = {
  title: "Edit product",
  description: "Update a product in your store.",
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const seller = await retrieveSeller().catch(() => null)

  if (!seller || !sellerHasPermission(seller, "products")) {
    notFound()
  }

  const product = await retrieveSellerProduct(id).catch(() => null)

  if (!product) {
    notFound()
  }

  const variants = (product.variants ?? []).map((v: any) => ({
    id: v.id,
    title: v.title,
    price: v.prices?.[0]?.amount,
    stock: v.inventory_items?.[0]?.location_levels?.[0]?.stocked_quantity,
  }))

  const photos = (product.images ?? []).map((image) => image.url).filter(Boolean)
  const orderedPhotos = photos.length ? photos : product.thumbnail ? [product.thumbnail] : []

  return (
    <div data-testid="edit-product-page">
      <EditProduct
        productId={product.id}
        title={product.title}
        description={product.description}
        photos={orderedPhotos}
        bannerUrl={product.metadata?.homepage_banner_image ?? null}
        videoUrl={product.metadata?.product_video ?? null}
        flashSale={product.metadata?.flash_sale}
        homepageBanner={product.metadata?.homepage_banner}
        variants={variants}
        showVideo={true}
      />
    </div>
  )
}
