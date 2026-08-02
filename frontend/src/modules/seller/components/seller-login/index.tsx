"use client"

import { useActionState } from "react"

import Input from "@modules/common/components/input"
import { SELLER_LOGIN_VIEW } from "@modules/seller/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { sellerLogin } from "@lib/data/seller"

type Props = {
  setCurrentView: (view: SELLER_LOGIN_VIEW) => void
}

const SellerLogin = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(sellerLogin, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="seller-login-page"
    >
      <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink mb-4">
        Sign in to your store
      </h1>
      <p className="text-center text-base-regular text-ink-muted mb-8">
        Manage your products, orders, and updates from one place.
      </p>
      <form className="w-full" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            data-testid="seller-email-input"
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="seller-password-input"
          />
        </div>
        <ErrorMessage error={message} data-testid="seller-login-error" />
        <SubmitButton className="w-full mt-6" data-testid="seller-sign-in-button">
          Sign in
        </SubmitButton>
      </form>
      <span className="text-center text-ink-muted text-small-regular mt-6">
        New to selling?{" "}
        <button
          onClick={() => setCurrentView(SELLER_LOGIN_VIEW.REGISTER)}
          className="underline text-ink"
          data-testid="seller-create-account-button"
        >
          Open a store
        </button>
        .
      </span>
    </div>
  )
}

export default SellerLogin