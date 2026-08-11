"use client"

import { useActionState } from "react"

import { upgradeCustomerToSeller } from "@lib/data/seller"
import type { KycProfileView } from "@lib/data/kyc"
import Input from "@modules/common/components/input"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type SellerSetupTemplateProps = {
  customer: {
    first_name?: string | null
    email?: string | null
  }
  kyc: KycProfileView | null
}

export default function SellerSetupTemplate({ customer, kyc }: SellerSetupTemplateProps) {
  const [message, formAction] = useActionState(upgradeCustomerToSeller, null)
  const canSell = kyc?.level === "profile_completed" || kyc?.level === "identity_verified"

  return (
    <div className="figma-container flex min-h-[calc(100vh-180px)] items-center justify-center py-12 small:py-20">
      <div className="figma-surface w-full max-w-[560px] p-6 small:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Seller setup</p>
        <h1 className="mt-3 font-display text-3xl font-medium tracking-[-0.02em] text-ink small:text-4xl">
          Turn your How’s U account into a store
        </h1>
        <p className="mt-4 max-w-lg text-base-regular leading-7 text-ink-muted">
          {customer.first_name ? `Hi ${customer.first_name}. ` : ""}Your How’s U account can shop, sell, and deliver. Complete your profile once, then set up a store whenever you are ready.
        </p>
        {!canSell ? (
          <div className="mt-8 rounded-control border border-ink-hairline bg-paper-tinted p-5">
            <h2 className="font-display text-xl font-medium text-ink">Complete your profile to unlock selling</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">Add your name, phone number, and address in Profile. You can create your store as soon as your profile is complete.</p>
            <LocalizedClientLink href="/account/profile" className="figma-button mt-5 inline-flex">Complete profile</LocalizedClientLink>
          </div>
        ) : (
          <form className="mt-8 grid gap-4" action={formAction}>
            <Input label="Store name" name="name" required autoComplete="organization" />
            <div className="flex flex-col gap-y-2">
              <label htmlFor="description" className="text-small-regular text-ink">
                Short description <span className="text-ink-muted">(optional)</span>
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                placeholder="What will people find in your store?"
                className="rounded-control border border-ink-hairline bg-white px-4 py-3 text-base-regular text-ink outline-none transition-colors focus:border-ink"
              />
            </div>
            <ErrorMessage error={message} data-testid="seller-setup-error" />
            <SubmitButton className="mt-2 w-full" data-testid="seller-setup-submit">Set up my store</SubmitButton>
          </form>
        )}
      </div>
    </div>
  )
}
