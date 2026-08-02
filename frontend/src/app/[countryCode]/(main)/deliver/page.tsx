import { Metadata } from "next"

import { listOpenDeliveryJobs } from "@lib/data/delivery"
import DeliverBoardClient from "@modules/delivery/templates/deliver-board"

export const metadata: Metadata = {
  title: "Deliver",
  description: "Browse open delivery jobs near you and earn by moving packages.",
}

export default async function DeliverPage() {
  const jobs = await listOpenDeliveryJobs().catch(() => [])

  return <DeliverBoardClient jobs={jobs} />
}
