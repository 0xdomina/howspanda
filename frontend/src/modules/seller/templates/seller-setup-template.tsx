"use client"

import { useActionState } from "react"

import { upgradeCustomerToSeller } from "@lib/data/seller"
import Input from "@modules/common/components/input"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type SellerSetupTemplateProps = {
  customer: {
    first_name?: string | null
    email?: string | null
  }
}

export default function SellerSetupTemplate({ customer }: SellerSetupTemplateProps) {
  const [message, formAction] = useActionState(upgradeCustomerToSeller, null)

  return (
    <div className="figma-container flex min-h-[calc(100vh-180px)] items-center justify-center py-12 small:py-20">
      <div className="figma-surface w-full max-w-[560px] p-6 small:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Seller setup</p>
        <h1 className="mt-3 font-display text-3xl font-medium tracking-[-0.02em] text-ink small:text-4xl">
          Turn your How’s U account into a store
        </h1>
        <p className="mt-4 max-w-lg text-base-regular leading-7 text-ink-muted">
          {customer.first_name ? `Hi ${customer.first_name}. ` : ""}Use your existing account to start selling. Your profile, login, orders, and wallet stay connected.
        </p>
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
        <p className="mt-5 text-center text-small-regular text-ink-muted">
          Need to complete your profile first?{" "}
          <LocalizedClientLink href="/account/profile" className="text-ink underline">Update your profile</LocalizedClientLink>
        </p>
      </div>
    </div>
  )
}
