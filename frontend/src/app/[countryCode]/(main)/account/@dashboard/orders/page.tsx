import { Metadata } from "next"

import OrderOverview from "@modules/account/components/order-overview"
import { requireAccountCustomer } from "@lib/data/account-guard"
import { listOrders } from "@lib/data/orders"
import AccountWarmup from "@modules/account/components/account-warmup"
import Divider from "@modules/common/components/divider"
import TransferRequestForm from "@modules/account/components/transfer-request-form"

export const metadata: Metadata = {
  title: "Orders",
  description: "Overview of your previous orders.",
}

export default async function Orders() {
  const { customer } = await requireAccountCustomer()
  if (!customer) {
    return <AccountWarmup title="Waking up your orders" />
  }
  const orders = (await listOrders().catch(() => null)) ?? []

  return (
    <div className="w-full" data-testid="orders-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Orders</h1>
        <p className="text-base-regular">
          View your previous orders and their status. You can also create
          returns or exchanges for your orders if needed.
        </p>
      </div>
      <div>
        <OrderOverview orders={orders} />
        <Divider className="my-16" />
        <TransferRequestForm />
      </div>
    </div>
  )
}
