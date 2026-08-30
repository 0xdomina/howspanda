import { retrieveCustomer } from "@lib/data/customer"
import { Toaster } from "@medusajs/ui"
import BackendWarmupGate from "@modules/account/components/backend-warmup-gate"
import AccountLayout from "@modules/account/templates/account-layout"

export default async function AccountPageLayout({
  dashboard,
  login,
}: {
  dashboard?: React.ReactNode
  login?: React.ReactNode
}) {
  const customer = await retrieveCustomer().catch(() => null)

  return (
    <AccountLayout customer={customer}>
      {customer ? dashboard : <BackendWarmupGate>{login}</BackendWarmupGate>}
      <Toaster />
    </AccountLayout>
  )
}
