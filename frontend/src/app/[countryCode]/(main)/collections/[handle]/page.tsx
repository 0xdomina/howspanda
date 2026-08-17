import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getCollectionByHandle } from "@lib/data/collections"
import { StoreCollection } from "@medusajs/types"
import CollectionTemplate from "@modules/collections/templates"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { getBaseURL } from "@lib/util/env"

type Props = {
  params: Promise<{ handle: string; countryCode: string }>
  searchParams: Promise<{
    page?: string
    sortBy?: SortOptions
  }>
}

export const PRODUCT_LIMIT = 12
export const dynamic = "force-dynamic"
export const dynamicParams = true

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const collection = await getCollectionByHandle(params.handle)

  if (!collection) {
    notFound()
  }

  const metadata = {
    title: `${collection.title} | How's u`,
    description: `${collection.title} collection on How's u`,
    alternates: {
      canonical: `${getBaseURL()}/${params.countryCode}/collections/${params.handle}`,
    },
    openGraph: {
      title: collection.title,
      description: `${collection.title} collection on How's u`,
      url: `${getBaseURL()}/${params.countryCode}/collections/${params.handle}`,
      siteName: "How's u",
      type: "website",
      images: collection.products?.[0]?.thumbnail
        ? [
            {
              url: collection.products[0].thumbnail,
              alt: `${collection.title} on How's u`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: collection.title,
      description: `${collection.title} collection on How's u`,
      images: collection.products?.[0]?.thumbnail
        ? [collection.products[0].thumbnail]
        : ["/opengraph-image.jpg"],
    },
  } as Metadata

  return metadata
}

export default async function CollectionPage(props: Props) {
  const searchParams = await props.searchParams
  const params = await props.params
  const { sortBy, page } = searchParams

  const collection = await getCollectionByHandle(params.handle).then(
    (collection: StoreCollection) => collection
  )

  if (!collection) {
    notFound()
  }

  return (
    <CollectionTemplate
      collection={collection}
      page={page}
      sortBy={sortBy}
      countryCode={params.countryCode}
    />
  )
}
