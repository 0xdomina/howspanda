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
    // Seller access is additive to the buyer account. A complete customer
    // profile is the seller unlock; KYC remains a valid fallback for older
    // accounts that already have a completed KYC profile.
    const profileComplete = Boolean(
      customer.first_name?.trim() &&
        customer.last_name?.trim() &&
        customer.phone?.trim() &&
        customer.addresses?.some(
          (address) =>
            address.address_1?.trim() &&
            address.city?.trim() &&
            address.country_code?.trim()
        )
    )

    return (
      <SellerSetupTemplate
        customer={customer}
        kyc={kyc}
        profileComplete={profileComplete}
      />
    )
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
