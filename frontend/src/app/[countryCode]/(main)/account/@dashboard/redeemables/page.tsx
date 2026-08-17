import { Metadata } from "next"
import { notFound } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"
import { listMyRedeemables } from "@lib/data/redeemables"
import MyRedeemables from "@modules/account/components/redeemables"

export const metadata: Metadata = {
  title: "Gift cards & passes",
  description: "Your gift cards, vouchers and tickets.",
}

export default async function RedeemablesPage() {
  const customer = await retrieveCustomer().catch(() => null)
  if (!customer) notFound()

  const items = await listMyRedeemables()
  return <MyRedeemables items={items} />
}
