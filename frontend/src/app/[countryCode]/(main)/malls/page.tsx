import { Metadata } from "next"

import { listActiveMalls, listRecentMallWins } from "@lib/data/mall"
import { retrieveCustomer } from "@lib/data/customer"
import { listSellerProducts, retrieveSeller, retrieveSellerBalance } from "@lib/data/seller"
import MallsClient from "@modules/mall/templates/malls-list"

export const metadata: Metadata = {
  title: "Malls",
  description: "Community sales events — join, shop, and win prizes.",
}

export default async function MallsPage() {
  const [malls, customer, wins, seller, sellerProducts, sellerBalance] = await Promise.all([
    listActiveMalls().catch(() => []),
    retrieveCustomer().catch(() => null),
    listRecentMallWins().catch(() => []),
    retrieveSeller().catch(() => null),
    listSellerProducts(),
    retrieveSellerBalance(),
  ])

  return (
    <MallsClient
      malls={malls}
      wins={wins}
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
