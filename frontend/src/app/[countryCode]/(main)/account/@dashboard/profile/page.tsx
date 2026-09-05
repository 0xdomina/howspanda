import { Metadata } from "next"

import ProfilePhone from "@modules/account//components/profile-phone"
import ProfileBillingAddress from "@modules/account/components/profile-billing-address"
import ProfileEmail from "@modules/account/components/profile-email"
import ProfileName from "@modules/account/components/profile-name"
import ProfilePassword from "@modules/account/components/profile-password"
import { ProfileIdentityVerification } from "@modules/account/components/verification"
import AddressBook from "@modules/account/components/address-book"
import AccountWarmup from "@modules/account/components/account-warmup"

import { getRegion, listRegions } from "@lib/data/regions"
import { requireAccountCustomer } from "@lib/data/account-guard"
import { retrieveMyKyc } from "@lib/data/kyc-server"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "Profile",
  description: "View and edit your How's u profile.",
}

export default async function Profile(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params
  const { countryCode } = params
  const { customer } = await requireAccountCustomer()
  if (!customer) {
    return <AccountWarmup title="Waking up your profile" />
  }

  const [regions, region, kyc] = await Promise.all([
    listRegions(),
    getRegion(countryCode),
    retrieveMyKyc(customer.email, customer.phone).catch(() => null),
  ])

  if (!regions || !region) {
    return <AccountWarmup title="Waking up your profile" />
  }

  return (
    <div className="w-full" data-testid="profile-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Profile</h1>
        <p className="text-base-regular">
          View and update your profile information, including your name, email,
          and phone number. You can also update your billing address, or change
          your password.
        </p>
      </div>
      <div className="mb-8 flex flex-col gap-4 rounded-control border border-ink-hairline bg-paper-surface p-5 small:flex-row small:items-center small:justify-between" data-testid="profile-manage-business">
        <div>
          <p className="text-sm font-semibold text-ink">Manage Business</p>
          <p className="mt-1 text-sm text-ink-muted">Set up or manage your store from the seller workspace.</p>
        </div>
        <LocalizedClientLink href="/seller" className="figma-button w-fit">Open Manage Business</LocalizedClientLink>
      </div>
      <div className="flex flex-col gap-y-8 w-full">
        <ProfileName customer={customer} />
        <Divider />
        <ProfileEmail customer={customer} />
        <Divider />
        <ProfilePhone customer={customer} />
        <Divider />
        <ProfileIdentityVerification email={customer.email ?? ""} kyc={kyc} />
        <Divider />
        {/* <ProfilePassword customer={customer} />
        <Divider /> */}
        <ProfileBillingAddress customer={customer} regions={regions} />
        <Divider />
        <div id="shipping-addresses">
          <h2 className="text-xl-semi">Shipping addresses</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Saved addresses appear automatically at checkout.
          </p>
          <div className="mt-4">
            <AddressBook customer={customer} region={region} />
          </div>
        </div>
      </div>
    </div>
  )
}

const Divider = () => {
  return <div className="w-full h-px bg-gray-200" />
}
;``
