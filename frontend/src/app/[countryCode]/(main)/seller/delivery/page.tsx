import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, listSellerOrders } from "@lib/data/seller"
import { listSellerDeliveryJobs } from "@lib/data/delivery"
import SellerDeliveryClient from "@modules/seller/templates/seller-delivery"

export const metadata: Metadata = {
  title: "Delivery",
  description: "Post delivery jobs and manage courier offers.",
}

export default async function SellerDeliveryPage() {
  const [seller, jobs, orders] = await Promise.all([
    retrieveSeller().catch(() => null),
    listSellerDeliveryJobs().catch(() => []),
    listSellerOrders().catch(() => []),
  ])

  if (!seller) {
    notFound()
  }

  return <SellerDeliveryClient jobs={jobs} orders={orders} />
}
