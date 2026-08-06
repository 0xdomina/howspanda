import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveDeliveryJob } from "@lib/data/delivery"
import { retrieveCustomer } from "@lib/data/customer"
import DeliverJobDetailClient from "@modules/delivery/templates/deliver-job-detail"

export const metadata: Metadata = {
  title: "Delivery job",
  description: "Track a delivery job, make offers, and coordinate the drop-off.",
}

export default async function DeliverJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [job, customer] = await Promise.all([
    retrieveDeliveryJob(id).catch(() => null),
    retrieveCustomer().catch(() => null),
  ])

  if (!job) {
    notFound()
  }

  return <DeliverJobDetailClient job={job} customer={customer} />
}
