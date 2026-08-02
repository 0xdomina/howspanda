import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, listSellerOrders } from "@lib/data/seller"
import { convertToLocale } from "@lib/util/money"

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
        <div className="text-center py-16 border border-dashed rounded-large">
          <p className="text-ink-muted">No orders yet.</p>
          <p className="text-sm text-ink-muted mt-1">
            When someone buys from your store, the order shows up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-hairline border border-ink-hairline rounded-large overflow-hidden">
          {orders.map((order: any) => (
            <li
              key={order.id}
              className="flex items-center justify-between gap-4 p-4 bg-paper-surface"
            >
              <div className="flex-1 min-w-0">
                <p className="text-ink font-medium truncate">{order.display_id}</p>
                <p className="text-sm text-ink-muted truncate">
                  {order.items?.length ?? 0}{" "}
                  {order.items?.length === 1 ? "item" : "items"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-ink font-mono tabular-nums">
                  {convertToLocale({
                    amount: Number(order.total ?? 0),
                    currency_code: "ngn",
                  })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}