import { Metadata } from "next"

import { listActiveMalls } from "@lib/data/mall"
import MallsClient from "@modules/mall/templates/malls-list"

export const metadata: Metadata = {
  title: "Malls",
  description: "Community sales events — join, shop, and win prizes.",
}

export default async function MallsPage() {
  const malls = await listActiveMalls().catch(() => [])

  return <MallsClient malls={malls} />
}
