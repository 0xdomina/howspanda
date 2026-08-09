"use client"

import { clx } from "@medusajs/ui"
import { ArrowRightOnRectangle } from "@medusajs/icons"
import { useParams, usePathname } from "next/navigation"

import ChevronDown from "@modules/common/icons/chevron-down"
import User from "@modules/common/icons/user"
import MapPin from "@modules/common/icons/map-pin"
import Package from "@modules/common/icons/package"
import Wallet from "@modules/common/icons/wallet"
import Bell from "@modules/common/icons/bell"
import FastDelivery from "@modules/common/icons/fast-delivery"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"
import { signout } from "@lib/data/customer"
import { getDisplayName } from "@lib/util/name"

const AccountNav = ({
  customer,
}: {
  customer: HttpTypes.StoreCustomer | null
}) => {
  const route = usePathname()
  const { countryCode } = useParams() as { countryCode: string }

  const handleLogout = async () => {
    await signout(countryCode)
  }

  return (
    <div>
      <div className="small:hidden" data-testid="mobile-account-nav">
        {route !== `/${countryCode}/account` ? (
          <LocalizedClientLink
            href="/account"
            className="flex items-center gap-x-2 text-small-regular py-2"
            data-testid="account-main-link"
          >
            <>
              <ChevronDown className="transform rotate-90" />
              <span>Account</span>
            </>
          </LocalizedClientLink>
        ) : (
          <>
            <div className="text-xl-semi mb-4 px-8">
              Hello {getDisplayName(customer) ?? "there"}
            </div>
            <div className="text-base-regular">
              <ul>
                <li>
                  <LocalizedClientLink
                    href="/account/profile"
                    className="flex items-center justify-between py-4 border-b border-ink-hairline px-8"
                    data-testid="profile-link"
                  >
                    <>
                      <div className="flex items-center gap-x-2">
                        <User size={20} />
                        <span>Profile</span>
                      </div>
                      <ChevronDown className="transform -rotate-90" />
                    </>
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/seller"
                    className="flex items-center justify-between py-4 border-b border-ink-hairline px-8"
                    data-testid="manage-business-link"
                  >
                    <div className="flex items-center gap-x-2">
                      <span aria-hidden="true">▣</span>
                      <span>Manage Business</span>
                    </div>
                    <ChevronDown className="transform -rotate-90" />
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/account/addresses"
                    className="flex items-center justify-between py-4 border-b border-ink-hairline px-8"
                    data-testid="addresses-link"
                  >
                    <>
                      <div className="flex items-center gap-x-2">
                        <MapPin size={20} />
                        <span>Addresses</span>
                      </div>
                      <ChevronDown className="transform -rotate-90" />
                    </>
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/account/orders"
                    className="flex items-center justify-between py-4 border-b border-ink-hairline px-8"
                    data-testid="orders-link"
                  >
                    <div className="flex items-center gap-x-2">
                      <Package size={20} />
                      <span>Orders</span>
                    </div>
                    <ChevronDown className="transform -rotate-90" />
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/account/wallet"
                    className="flex items-center justify-between py-4 border-b border-ink-hairline px-8"
                    data-testid="wallet-link"
                  >
                    <div className="flex items-center gap-x-2">
                      <Wallet size={20} />
                      <span>Wallet</span>
                    </div>
                    <ChevronDown className="transform -rotate-90" />
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/account/courier"
                    className="flex items-center justify-between py-4 border-b border-ink-hairline px-8"
                    data-testid="courier-link"
                  >
                    <div className="flex items-center gap-x-2">
                      <FastDelivery size={20} />
                      <span>Courier</span>
                    </div>
                    <ChevronDown className="transform -rotate-90" />
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    href="/account/notifications"
                    className="flex items-center justify-between py-4 border-b border-ink-hairline px-8"
                    data-testid="notifications-link"
                  >
                    <div className="flex items-center gap-x-2">
                      <Bell size={20} />
                      <span>Notifications</span>
                    </div>
                    <ChevronDown className="transform -rotate-90" />
                  </LocalizedClientLink>
                </li>
                <li>
                  <button
                    type="button"
                    className="flex items-center justify-between py-4 border-b border-ink-hairline px-8 w-full"
                    onClick={handleLogout}
                    data-testid="logout-button"
                  >
                    <div className="flex items-center gap-x-2">
                      <ArrowRightOnRectangle />
                      <span>Log out</span>
                    </div>
                    <ChevronDown className="transform -rotate-90" />
                  </button>
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
      <div className="hidden small:block" data-testid="account-nav">
        <div>
          <div className="pb-4"><h3 className="text-sm font-semibold text-ink">Your account</h3></div>
          <div className="text-base-regular">
            <ul className="mb-0 flex flex-col items-start justify-start gap-1">
              <li>
                <AccountNavLink
                  href="/account"
                  route={route!}
                  data-testid="overview-link"
                >
                  Overview
                </AccountNavLink>
              </li>
              <li>
                <AccountNavLink
                  href="/account/profile"
                  route={route!}
                  data-testid="profile-link"
                >
                  Profile
                </AccountNavLink>
              </li>
              <li>
                <AccountNavLink
                  href="/seller"
                  route={route!}
                  data-testid="manage-business-link"
                >
                  Manage Business
                </AccountNavLink>
              </li>
              <li>
                <AccountNavLink
                  href="/account/addresses"
                  route={route!}
                  data-testid="addresses-link"
                >
                  Addresses
                </AccountNavLink>
              </li>
              <li>
                <AccountNavLink
                  href="/account/orders"
                  route={route!}
                  data-testid="orders-link"
                >
                  Orders
                </AccountNavLink>
              </li>
              <li>
                <AccountNavLink
                  href="/account/wallet"
                  route={route!}
                  data-testid="wallet-link"
                >
                  Wallet
                </AccountNavLink>
              </li>
              <li>
                <AccountNavLink
                  href="/account/courier"
                  route={route!}
                  data-testid="courier-link"
                >
                  Courier
                </AccountNavLink>
              </li>
              <li>
                <AccountNavLink
                  href="/account/notifications"
                  route={route!}
                  data-testid="notifications-link"
                >
                  Notifications
                </AccountNavLink>
              </li>
              <li className="text-ink-muted">
                <button
                  type="button"
                  onClick={handleLogout}
                  data-testid="logout-button"
                >
                  Log out
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

type AccountNavLinkProps = {
  href: string
  route: string
  children: React.ReactNode
  "data-testid"?: string
}

const AccountNavLink = ({
  href,
  route,
  children,
  "data-testid": dataTestId,
}: AccountNavLinkProps) => {
  const { countryCode }: { countryCode: string } = useParams()

  const active = route.split(countryCode)[1] === href
  return (
    <LocalizedClientLink
      href={href}
      className={clx("block rounded-full px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-paper-tinted hover:text-ink", {
        "bg-ink font-semibold text-white hover:bg-ink hover:text-white": active,
      })}
      data-testid={dataTestId}
    >
      {children}
    </LocalizedClientLink>
  )
}

export default AccountNav
