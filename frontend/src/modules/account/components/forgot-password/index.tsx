"use client"

import { useState, useTransition } from "react"
import Input from "@modules/common/components/input"
import Button from "@modules/common/components/button"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { requestAuthOtp, resetPasswordOtp } from "@lib/data/auth-otp"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const ForgotPassword = ({ setCurrentView }: Props) => {
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [sent, setSent] = useState(false)
  const [done, setDone] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const send = () => {
    setError(null)
    if (!email.trim()) {
      setError("Enter your email.")
      return
    }
    startTransition(async () => {
      const res = await requestAuthOtp({
        email: email.trim(),
        purpose: "reset",
      })
      if (!res.ok) {
        setError(res.error ?? "Could not send the code.")
        return
      }
      setSent(true)
      setHint("A reset code was sent to your email.")
    })
  }

  const reset = () => {
    setError(null)
    if (code.trim().length === 0) {
      setError("Enter the verification code.")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    startTransition(async () => {
      const res = await resetPasswordOtp({
        email: email.trim(),
        code: code.trim(),
        newPassword: password,
      })
      if (!res.ok) {
        setError(res.error ?? "Could not reset the password.")
        return
      }
      setDone(true)
    })
  }

  if (done) {
    return (
      <div
        className="max-w-sm w-full flex flex-col items-center"
        data-testid="reset-done"
      >
        <h1 className="text-large-semi uppercase mb-4">Password reset</h1>
        <p className="text-center text-base-regular text-ui-fg-base mb-6">
          Your password has been reset. Sign in with your new password.
        </p>
        <Button
          size="large"
          className="w-full"
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
        >
          Back to sign in
        </Button>
      </div>
    )
  }

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="forgot-password-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Forgot password</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-4">
        Enter your email and we&apos;ll send you a code to reset your password.
      </p>
      <div className="w-full flex flex-col gap-y-2">
        <Input
          label="Email"
          name="email"
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="email-input"
        />
        {!sent ? (
          <Button
            size="large"
            className="w-full mt-4"
            isLoading={isPending}
            onClick={send}
            data-testid="send-reset-code-button"
          >
            Send reset code
          </Button>
        ) : (
          <>
            <Input
              label="Verification code"
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))
              }
              data-testid="otp-input"
            />
            <Input
              label="New password"
              name="password"
              required
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="new-password-input"
            />
            {hint && <p className="text-xs text-ui-fg-subtle">{hint}</p>}
            <Button
              size="large"
              className="w-full mt-4"
              isLoading={isPending}
              disabled={code.trim().length === 0 || password.length < 8}
              onClick={reset}
              data-testid="reset-password-button"
            >
              Reset password
            </Button>
          </>
        )}
        <ErrorMessage error={error} data-testid="reset-error" />
        <button
          type="button"
          onClick={() => {
            setSent(false)
            setHint(null)
            setError(null)
            setCode("")
            setPassword("")
          }}
          className="text-center text-ui-fg-subtle text-small-regular mt-2 underline"
        >
          Back
        </button>
      </div>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Remembered it?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="underline"
        >
          Sign in
        </button>
        .
      </span>
    </div>
  )
}

export default ForgotPassword
