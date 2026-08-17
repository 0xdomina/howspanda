import { Metadata } from "next"
import { notFound } from "next/navigation"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import ProductTemplate from "@modules/products/templates"
import { HttpTypes } from "@medusajs/types"
import { getBaseURL } from "@lib/util/env"
import { retrieveProductRatingSummary } from "@lib/data/reviews"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
  searchParams: Promise<{ v_id?: string }>
}

export const dynamic = "force-dynamic"
export const dynamicParams = true

function getImagesForVariant(
  product: HttpTypes.StoreProduct,
  selectedVariantId?: string
) {
  if (!selectedVariantId || !product.variants) {
    return product.images ?? []
  }

  const variant = product.variants.find((v) => v.id === selectedVariantId)
  if (!variant || !variant.images?.length) {
    return product.images ?? []
  }

  const imageIdsMap = new Map(variant.images.map((i) => [i.id, true]))
  return (product.images ?? []).filter((i) => imageIdsMap.has(i.id))
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const { handle } = params
  const region = await getRegion(params.countryCode)

  if (!region) {
    notFound()
  }

  const product = await listProducts({
    countryCode: params.countryCode,
    queryParams: { handle },
  }).then(({ response }) => response.products[0])

  if (!product) {
    notFound()
  }

  const url = `${getBaseURL()}/${params.countryCode}/products/${handle}`
  const productVideo =
    typeof product.metadata?.product_video === "string"
      ? product.metadata.product_video
      : null

  return {
    title: `${product.title} | How's u`,
    description: product.description ?? product.title,
    alternates: { canonical: url },
    openGraph: {
      title: `${product.title} | How's u`,
      description: product.description ?? product.title,
      url,
      images: product.thumbnail ? [product.thumbnail] : [],
      videos: productVideo ? [productVideo] : undefined,
      type: "website",
      siteName: "How's u",
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description: product.description ?? product.title,
      images: product.thumbnail ? [product.thumbnail] : undefined,
    },
  }
}

export default async function ProductPage(props: Props) {
  const params = await props.params
  const region = await getRegion(params.countryCode)
  const searchParams = await props.searchParams

  const selectedVariantId = searchParams.v_id

  if (!region) {
    notFound()
  }

  const pricedProduct = await listProducts({
    countryCode: params.countryCode,
    queryParams: { handle: params.handle },
  }).then(({ response }) => response.products[0])

  if (!pricedProduct) {
    notFound()
  }

  const images = getImagesForVariant(pricedProduct, selectedVariantId)
  const ratingSummary = await retrieveProductRatingSummary(pricedProduct.id).catch(
    () => ({ average: 0, count: 0, reviews: [] })
  )

  return (
    <ProductTemplate
      product={pricedProduct}
      region={region}
      countryCode={params.countryCode}
      images={images}
      ratingSummary={ratingSummary}
    />
  )
}
