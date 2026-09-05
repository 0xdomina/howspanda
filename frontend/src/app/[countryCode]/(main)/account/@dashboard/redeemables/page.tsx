import { Metadata } from "next"
import { requireAccountCustomer } from "@lib/data/account-guard"
import { listMyRedeemables } from "@lib/data/redeemables"
import AccountWarmup from "@modules/account/components/account-warmup"
import MyRedeemables from "@modules/account/components/redeemables"

export const metadata: Metadata = {
  title: "Gift cards & passes",
  description: "Your gift cards, vouchers and tickets.",
}

export default async function RedeemablesPage() {
  const { customer } = await requireAccountCustomer()
  if (!customer) {
    return <AccountWarmup title="Waking up your gift cards" />
  }

  const items = await listMyRedeemables()
  return <MyRedeemables items={items} />
}
