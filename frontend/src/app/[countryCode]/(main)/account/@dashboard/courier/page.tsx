import { Metadata } from "next"

import { retrieveCustomer } from "@lib/data/customer"
import { getCourierMe } from "@lib/data/delivery"
import CourierDashboard from "@modules/account/templates/courier-dashboard"

export const metadata: Metadata = {
  title: "Courier",
  description: "Apply to courier, track your delivery activity and earnings.",
}

export default async function CourierPage() {
  const customer = await retrieveCustomer().catch(() => null)
  const me = await getCourierMe().catch(() => null)

  return <CourierDashboard customer={customer} me={me} />
}
