import { Metadata } from "next"
import { requireAccountCustomer } from "@lib/data/account-guard"
import { listBuyerProductRequests } from "@lib/data/product-requests"
import AccountWarmup from "@modules/account/components/account-warmup"
import BuyerRequests from "@modules/account/components/requests"

export const metadata: Metadata = { title: "Product requests", description: "Track your requests to stores." }

export default async function RequestsPage() {
  const { customer } = await requireAccountCustomer()
  if (!customer) {
    return <AccountWarmup title="Waking up your requests" />
  }
  return <BuyerRequests requests={await listBuyerProductRequests()} />
}
