import { Metadata } from "next"

import Overview from "@modules/account/components/overview"
import { retrieveCustomer } from "@lib/data/customer"
import { listOrders } from "@lib/data/orders"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "Account",
  description: "Overview of your account activity.",
}

export default async function OverviewTemplate() {
  const customer = await retrieveCustomer().catch(() => null)
  const orders = (await listOrders().catch(() => null)) || null

  if (!customer) {
    return (
      <section className="mx-auto flex min-h-[360px] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Your account is taking a moment
        </h1>
        <p className="text-sm leading-6 text-ink-muted">
          We could not load your account just yet. Try again and we will pick up where you left off.
        </p>
        <LocalizedClientLink href="/account" className="figma-button">
          Try again
        </LocalizedClientLink>
      </section>
    )
  }

  return <Overview customer={customer} orders={orders} />
}
