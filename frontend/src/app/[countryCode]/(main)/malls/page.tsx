import { Metadata } from "next"

import { listActiveMalls, listRecentMallWins } from "@lib/data/mall"
import { retrieveCustomer } from "@lib/data/customer"
import { retrieveSeller } from "@lib/data/seller"
import { retrieveFeatures } from "@lib/data/kyc"
import MallsClient from "@modules/mall/templates/malls-list"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Malls",
  description: "Community sales events — join, shop, and win prizes.",
}

export default async function MallsPage() {
  const features = await retrieveFeatures()
  if (!features.malls) notFound()

  const [malls, customer, wins, seller] = await Promise.all([
    listActiveMalls().catch(() => []),
    retrieveCustomer().catch(() => null),
    listRecentMallWins().catch(() => []),
    retrieveSeller().catch(() => null),
  ])

  return (
    <MallsClient
      malls={malls}
      wins={wins}
      customerEmail={customer?.email ?? null}
      seller={seller}
    />
  )
}
