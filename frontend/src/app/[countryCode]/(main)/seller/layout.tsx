import { retrieveSeller } from "@lib/data/seller"
import { retrieveCustomer } from "@lib/data/customer"
import { retrieveMyKyc } from "@lib/data/kyc-server"
import SellerLayout from "@modules/seller/templates/seller-layout"
import SellerSetupTemplate from "@modules/seller/templates/seller-setup-template"
import { redirect } from "next/navigation"

export default async function SellerRouteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ countryCode: string }>
}) {
  const [{ countryCode }, seller, customer] = await Promise.all([
    params,
    retrieveSeller().catch(() => null),
    retrieveCustomer().catch(() => null),
  ])

  if (!seller && customer) {
    const kyc = await retrieveMyKyc(customer.email, customer.phone).catch(() => null)
    return <SellerSetupTemplate customer={customer} kyc={kyc} />
  }

  if (!seller) {
    redirect(`/${countryCode}/account`)
  }

  return (
    <SellerLayout seller={seller}>
      {children}
    </SellerLayout>
  )
}
