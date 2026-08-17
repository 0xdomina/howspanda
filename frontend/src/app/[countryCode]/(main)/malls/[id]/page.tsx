import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveMall, listMallGoods } from "@lib/data/mall"
import { getBaseURL } from "@lib/util/env"
import { retrieveCustomer } from "@lib/data/customer"
import { listSellerProducts, retrieveSeller, retrieveSellerBalance } from "@lib/data/seller"
import { retrieveFeatures } from "@lib/data/kyc"
import MallDetailClient from "@modules/mall/templates/mall-detail"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ countryCode: string; id: string }>
}): Promise<Metadata> {
  const { countryCode, id } = await params
  const mall = await retrieveMall(id).catch(() => null)
  const title = mall?.name ?? "Mall"
  const description =
    mall?.description ?? "Join a How's u community shopping event."
  const url = `${getBaseURL()}/${countryCode}/malls/${id}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "How's u",
      type: "website",
      images: [{ url: "/opengraph-image.jpg", alt: "How's u community mall" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/opengraph-image.jpg"],
    },
  }
}

export default async function MallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const features = await retrieveFeatures()
  if (!features.malls) notFound()

  const [mall, customer, goods, seller, sellerProducts, sellerBalance] = await Promise.all([
    retrieveMall(id).catch(() => null),
    retrieveCustomer().catch(() => null),
    listMallGoods(id).catch(() => []),
    retrieveSeller().catch(() => null),
    listSellerProducts().catch(() => []),
    retrieveSellerBalance().catch(() => null),
  ])

  if (!mall) {
    notFound()
  }

  return (
    <MallDetailClient
      mall={mall}
      detail={mall}
      goods={goods}
      customerEmail={customer?.email ?? null}
      seller={seller}
      sellerProducts={sellerProducts}
      sellerBalanceNgn={
        sellerBalance?.balances?.ngn?.available == null
          ? null
          : Number(sellerBalance.balances.ngn.available) / 100
      }
    />
  )
}
