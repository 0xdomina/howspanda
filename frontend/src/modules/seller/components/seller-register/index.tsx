"use client"

import { useActionState } from "react"

import Input from "@modules/common/components/input"
import { SELLER_LOGIN_VIEW } from "@modules/seller/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { sellerRegister } from "@lib/data/seller"

type Props = {
  setCurrentView: (view: SELLER_LOGIN_VIEW) => void
}

const SellerRegister = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(sellerRegister, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="seller-register-page"
    >
      <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink mb-4">
        Open a store
      </h1>
      <p className="text-center text-base-regular text-ink-muted mb-8">
        Start selling what you make. You can add products and set prices right
        after.
      </p>
      <form className="w-full" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Store name"
            name="name"
            required
            autoComplete="organization"
            data-testid="seller-name-input"
          />
          <Input
            label="First name"
            name="first_name"
            required
            autoComplete="given-name"
            data-testid="seller-first-name-input"
          />
          <Input
            label="Last name"
            name="last_name"
            required
            autoComplete="family-name"
            data-testid="seller-last-name-input"
          />
          <Input
            label="Email"
            name="email"
            required
            type="email"
            autoComplete="email"
            data-testid="seller-email-input"
          />
          <Input
            label="Password"
            name="password"
            required
            type="password"
            autoComplete="new-password"
            data-testid="seller-password-input"
          />
        </div>
        <ErrorMessage error={message} data-testid="seller-register-error" />
        <SubmitButton className="w-full mt-6" data-testid="seller-create-button">
          Create store
        </SubmitButton>
      </form>
      <span className="text-center text-ink-muted text-small-regular mt-6">
        Already have a store?{" "}
        <button
          onClick={() => setCurrentView(SELLER_LOGIN_VIEW.SIGN_IN)}
          className="underline text-ink"
          data-testid="seller-login-button"
        >
          Sign in
        </button>
        .
      </span>
    </div>
  )
}

export default SellerRegister