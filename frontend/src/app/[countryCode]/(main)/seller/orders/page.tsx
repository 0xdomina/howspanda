import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, listSellerOrders } from "@lib/data/seller"
import OrderActions from "@modules/seller/components/order-actions"

export const metadata: Metadata = {
  title: "Your orders",
  description: "View and manage the orders in your store.",
}

export default async function SellerOrdersPage() {
  const seller = await retrieveSeller().catch(() => null)
  const orders = (await listSellerOrders().catch(() => [])) || []

  if (!seller) {
    notFound()
  }

  return (
    <div data-testid="seller-orders-page">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink mb-6">
        Orders
      </h2>

      {orders.length === 0 ? (
        <div className="rounded-control border border-dashed border-ink-hairline bg-white py-16 text-center">
          <p className="text-ink-muted">No orders yet.</p>
          <p className="text-sm text-ink-muted mt-1">
            When someone buys from your store, the order shows up here.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-control border border-ink-hairline bg-white divide-y divide-ink-hairline">
          {orders.map((order: any) => (
            <li
              key={order.id}
              className="flex items-center justify-between gap-4 bg-white p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-ink font-medium truncate">{order.display_id}</p>
                <p className="text-sm text-ink-muted truncate">
                  {order.items?.length ?? 0}{" "}
                  {order.items?.length === 1 ? "item" : "items"}
                </p>
              </div>
              <OrderActions order={order} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
