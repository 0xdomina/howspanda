import { retrieveSeller } from "@lib/data/seller"
import { retrieveCustomer } from "@lib/data/customer"
import SellerLayout from "@modules/seller/templates/seller-layout"
import LoginTemplate from "@modules/seller/templates/login-template"
import SellerSetupTemplate from "@modules/seller/templates/seller-setup-template"

export default async function SellerRouteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [seller, customer] = await Promise.all([
    retrieveSeller().catch(() => null),
    retrieveCustomer().catch(() => null),
  ])

  if (!seller && customer) {
    return <SellerSetupTemplate customer={customer} />
  }

  if (!seller) {
    return <LoginTemplate />
  }

  return (
    <SellerLayout seller={seller}>
      {children}
    </SellerLayout>
  )
}
