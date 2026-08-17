import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveMall, listMallGoods } from "@lib/data/mall"
import { retrieveCustomer } from "@lib/data/customer"
import { listSellerProducts, retrieveSeller, retrieveSellerBalance } from "@lib/data/seller"
import { retrieveFeatures } from "@lib/data/kyc"
import MallDetailClient from "@modules/mall/templates/mall-detail"

export const metadata: Metadata = {
  title: "Mall",
  description: "A community sales event.",
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
