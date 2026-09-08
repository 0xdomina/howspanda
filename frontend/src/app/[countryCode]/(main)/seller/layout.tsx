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
  const [{ countryCode }, seller, initialCustomer] = await Promise.all([
    params,
    retrieveSeller().catch(() => null),
    retrieveCustomer().catch(() => null),
  ])
  let customer = initialCustomer

  if (!seller && customer) {
    // Password-only (Neon) accounts unify on the client (SellerBridgeAuto
    // calls the bridge server action, which alone may set cookies — server
    // components can only read them). Until then they get the manual form.
    const kyc = await retrieveMyKyc(customer.email, customer.phone).catch(() => null)
    // Any still-unbridged password account gets the one-step email-verify
    // form instead of a dead-end profile loop.
    const needsBridge =
      typeof customer.id === "string" && customer.id.startsWith("neon_")
    // Seller access is additive to the buyer account. A complete customer
    // profile is the seller unlock; KYC remains a valid fallback for older
    // accounts that already have a completed KYC profile.
    const profileComplete = Boolean(
      customer.first_name?.trim() &&
        customer.last_name?.trim() &&
        customer.phone?.trim()
    )

    return (
      <SellerSetupTemplate
        customer={customer}
        kyc={kyc}
        profileComplete={profileComplete}
        needsBridge={needsBridge}
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
