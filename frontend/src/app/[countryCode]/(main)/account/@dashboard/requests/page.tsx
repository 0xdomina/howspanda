import { Metadata } from "next"
import { notFound } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"
import { listBuyerProductRequests } from "@lib/data/product-requests"
import BuyerRequests from "@modules/account/components/requests"

export const metadata: Metadata = { title: "Product requests", description: "Track your requests to stores." }

export default async function RequestsPage() {
  const customer = await retrieveCustomer().catch(() => null)
  if (!customer) notFound()
  return <BuyerRequests requests={await listBuyerProductRequests()} />
}
