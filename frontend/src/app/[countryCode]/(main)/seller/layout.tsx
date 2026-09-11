import { retrieveSellerState } from "@lib/data/seller"
import { retrieveCustomer } from "@lib/data/customer"
import { retrieveMyKyc } from "@lib/data/kyc-server"
import AccountWarmup from "@modules/account/components/account-warmup"
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
  // Sequenced, not parallel: retrieveCustomer unifies identity first
  // (bridging a Neon-only session into a Medusa JWT), so the seller read
  // below sees the same user instead of racing it and misreading an owner
  // as "no store".
  const { countryCode } = await params
  const customer = await retrieveCustomer().catch(() => null)
  const sellerState = await retrieveSellerState()
  const seller = sellerState.seller

  // Store status unknown (backend nap, not a "no"): NEVER show the
  // create-store flow — store owners would see "open a store" for a store
  // they already own. Retry state instead; it resolves itself on wake.
  if (sellerState.status === "unknown" && customer) {
    return (
      <div className="figma-container py-10">
        <AccountWarmup title="Checking your store" />
      </div>
    )
  }

  if (!seller && customer) {
    // No store on the unified identity: either a true non-seller (setup
    // flow) or a still-unbridged Neon account while the backend naps
    // (one-step bridge form, never a dead-end redirect loop).
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
    <SellerLayout
      seller={
        seller
          ? {
              ...seller,
              // SellerAdmin nests the storefront fields under .seller; the
              // header template reads them flat — bridge the shape here so
              // the workspace shows the store name, not a fallback.
              name: seller.seller?.name ?? seller.first_name,
              handle: seller.seller?.handle,
            }
          : null
      }
    >
      {children}
    </SellerLayout>
  )
}
