import { Metadata } from "next"

import { listActiveMalls } from "@lib/data/mall"
import { retrieveCustomer } from "@lib/data/customer"
import MallsClient from "@modules/mall/templates/malls-list"

export const metadata: Metadata = {
  title: "Malls",
  description: "Community sales events — join, shop, and win prizes.",
}

export default async function MallsPage() {
  const [malls, customer] = await Promise.all([
    listActiveMalls().catch(() => []),
    retrieveCustomer().catch(() => null),
  ])

  return <MallsClient malls={malls} customerEmail={customer?.email ?? null} />
}
