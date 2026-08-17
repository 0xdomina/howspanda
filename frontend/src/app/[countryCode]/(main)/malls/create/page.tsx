import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, listSellerProducts, retrieveSellerBalance } from "@lib/data/seller"
import { retrieveFeatures } from "@lib/data/kyc"
import { sellerHasPermission } from "@lib/seller-permissions"
import MallCreateTemplate from "@modules/mall/templates/mall-create"

export const metadata: Metadata = {
  title: "Create a mall",
  description: "Create a How's U mall for your store.",
}

export default async function MallCreatePage() {
  const features = await retrieveFeatures()
  if (!features.malls) notFound()

  const seller = await retrieveSeller().catch(() => null)
  if (!seller || !sellerHasPermission(seller, "malls")) notFound()

  const [products, balance] = await Promise.all([
    listSellerProducts(),
    retrieveSellerBalance(),
  ])
  const availableBalanceNgn =
    balance?.balances?.ngn?.available == null
      ? null
      : Number(balance.balances.ngn.available) / 100

  return <MallCreateTemplate products={products} availableBalanceNgn={availableBalanceNgn} />
}
