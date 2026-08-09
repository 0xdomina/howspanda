import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller } from "@lib/data/seller"
import { listSellerMalls } from "@lib/data/mall"
import SellerMallsClient from "@modules/seller/templates/seller-malls-overview"
import { listSellerProducts, retrieveSellerBalance } from "@lib/data/seller"
import { sellerHasPermission } from "@lib/seller-permissions"

export const metadata: Metadata = {
  title: "Malls",
  description: "Create and join community sales events.",
}

export default async function SellerMallsPage() {
  const seller = await retrieveSeller().catch(() => null)
  const [malls, products, balance] = await Promise.all([
    listSellerMalls().catch(() => []),
    listSellerProducts(),
    retrieveSellerBalance(),
  ])

  if (!seller || !sellerHasPermission(seller, "malls")) {
    notFound()
  }

  return (
    <SellerMallsClient
      malls={malls}
      products={products}
      sellerId={seller.seller?.id ?? null}
      availableBalanceNgn={
        balance?.balances?.ngn?.available == null
          ? null
          : Number(balance.balances.ngn.available) / 100
      }
    />
  )
}
