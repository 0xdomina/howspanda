import { Metadata } from "next"

import { listActiveMalls, listRecentMallWins } from "@lib/data/mall"
import { retrieveCustomer } from "@lib/data/customer"
import MallsClient from "@modules/mall/templates/malls-list"

export const metadata: Metadata = {
  title: "Malls",
  description: "Community sales events — join, shop, and win prizes.",
}

export default async function MallsPage() {
  const [malls, customer, wins] = await Promise.all([
    listActiveMalls().catch(() => []),
    retrieveCustomer().catch(() => null),
    listRecentMallWins().catch(() => []),
  ])

  return (
    <MallsClient malls={malls} wins={wins} customerEmail={customer?.email ?? null} />
  )
}
