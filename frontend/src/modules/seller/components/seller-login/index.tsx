"use client"

import { useActionState } from "react"

import Input from "@modules/common/components/input"
import { SELLER_LOGIN_VIEW } from "@modules/seller/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { sellerLogin } from "@lib/data/seller"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

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
        Sign in to your How’s U account
      </h1>
      <p className="text-center text-base-regular text-ink-muted mb-8">
        Your existing How’s U account is also your seller account. Sign in once, then set up your store.
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
      <span className="mt-6 text-center text-small-regular text-ink-muted">
        New to How’s U?{" "}
        <LocalizedClientLink href="/account?mode=register" className="text-ink underline" data-testid="seller-create-account-button">
          Create your account
        </LocalizedClientLink>
      </span>
    </div>
  )
}

export default SellerLogin
