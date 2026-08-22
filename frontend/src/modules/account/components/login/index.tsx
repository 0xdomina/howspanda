"use client"

import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import Button from "@modules/common/components/button"
import Input from "@modules/common/components/input"
import GoogleSignIn from "@modules/account/components/google-signin"
import { useState } from "react"
import type { FormEvent } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
  countryCode: string
}

const Login = ({ setCurrentView, countryCode }: Props) => {
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setMessage(null)

    try {
      const formData = new FormData(event.currentTarget)
      const email = String(formData.get("email") || "").trim().toLowerCase()
      const password = String(formData.get("password") || "")
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const result = (await response.json().catch(() => null)) as {
        actor?: "customer" | "seller"
        message?: string
      } | null

      if (!response.ok || !result?.actor) {
        throw new Error(result?.message || "The email or password is incorrect.")
      }

      window.location.assign(
        `/${countryCode}/${result.actor === "seller" ? "seller" : "account"}`
      )
    } catch (error: any) {
      setMessage(error?.message || "We could not sign you in. Please try again.")
      setPending(false)
    }
  }

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="login-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Sign in</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Sign in to shop, sell, and deliver on How&rsquo;s u.
      </p>
      <form className="w-full" onSubmit={signIn}>
        <input type="hidden" name="countryCode" value={countryCode} />
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Email"
            name="email"
            type="email"
            title="Enter a valid email address."
            autoComplete="email"
            required
            data-testid="email-input"
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="password-input"
          />
        </div>
        <ErrorMessage error={message} data-testid="login-error-message" />
        <Button
          type="submit"
          data-testid="sign-in-button"
          className="w-full mt-6"
          disabled={pending}
          isLoading={pending}
        >
          Sign in
        </Button>
      </form>
      <button
        type="button"
        onClick={() => setCurrentView(LOGIN_VIEW.FORGOT_PASSWORD)}
        className="text-center text-ui-fg-subtle text-small-regular mt-4 underline"
        data-testid="forgot-password-link"
      >
        Forgot your password?
      </button>
      <GoogleSignIn />
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Not a member?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className="underline"
          data-testid="register-button"
        >
          Join us
        </button>
        .
      </span>
    </div>
  )
}

export default Login
