"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Input from "@modules/common/components/input"
import Button from "@modules/common/components/button"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import GoogleSignIn from "@modules/account/components/google-signin"
import { signup } from "@lib/data/customer"
import { requestAuthOtp, verifyAuthOtp } from "@lib/data/auth-otp"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Register = ({ setCurrentView }: Props) => {
  const router = useRouter()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"credentials" | "code">("credentials")
  const [sent, setSent] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const continueToCode = () => {
    setError(null)
    if (!email.trim()) {
      setError("Enter your email.")
      return
    }
    if (!password) {
      setError("Enter a password.")
      return
    }
    setStep("code")
  }

  const requestCode = () => {
    setError(null)
    startTransition(async () => {
      const res = await requestAuthOtp({
        email: email.trim(),
        purpose: "signup",
      })
      if (!res.ok) {
        setError(res.error ?? "Could not send the code.")
        return
      }
      setSent(true)
      setHint(
        res.code
          ? `Dev code sent: ${res.code}`
          : "A verification code was sent to your email."
      )
    })
  }

  const verifyAndCreate = () => {
    setError(null)
    if (code.trim().length === 0) {
      setError("Enter the verification code.")
      return
    }
    startTransition(async () => {
      const res = await verifyAuthOtp({
        email: email.trim(),
        purpose: "signup",
        code: code.trim(),
      })
      if (!res.ok || !res.proof) {
        setError(res.error ?? "Could not verify the code.")
        return
      }

      const formData = new FormData()
      formData.set("email", email.trim())
      formData.set("password", password)
      formData.set("proof", res.proof)
      if (firstName.trim()) formData.set("first_name", firstName.trim())
      if (lastName.trim()) formData.set("last_name", lastName.trim())
      if (phone.trim()) formData.set("phone", phone.trim())

      const result = await signup(null, formData)
      if (typeof result === "string") {
        setError(result)
        return
      }
      router.refresh()
    })
  }

  return (
    <div
      className="max-w-sm flex flex-col items-center"
      data-testid="register-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Join How&rsquo;s u</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-4">
        Create your account, set up your profile, and get access to an enhanced
        shopping, selling, and delivery experience.
      </p>
      <div className="w-full flex flex-col">
        {step === "credentials" ? (
          <div className="flex flex-col gap-y-2">
            <div className="grid grid-cols-2 gap-x-4">
              <Input
                label="First name"
                name="first_name"
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                data-testid="first-name-input"
              />
              <Input
                label="Last name"
                name="last_name"
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                data-testid="last-name-input"
              />
            </div>
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
            <Input
              label="Password"
              name="password"
              required
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="password-input"
            />
            <Input
              label="Phone (optional)"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid="phone-input"
            />
            <ErrorMessage error={error} data-testid="register-error" />
            <Button
              size="large"
              className="w-full mt-6"
              isLoading={isPending}
              onClick={continueToCode}
              data-testid="register-continue-button"
            >
              Continue
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-y-2">
            <p className="text-sm text-ui-fg-subtle">
              Verify your email to finish creating your account. We sent the
              code to <span className="font-medium text-ui-fg-base">{email.trim()}</span>.
            </p>
            {!sent ? (
              <Button
                size="large"
                className="w-full mt-2"
                isLoading={isPending}
                onClick={requestCode}
                data-testid="register-send-code-button"
              >
                Send code to my email
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
                    setCode(
                      e.target.value.replace(/[^\d]/g, "").slice(0, 6)
                    )
                  }
                  data-testid="otp-input"
                />
                {hint && <p className="text-xs text-ui-fg-subtle">{hint}</p>}
                <Button
                  size="large"
                  className="w-full mt-2"
                  isLoading={isPending}
                  disabled={code.trim().length === 0}
                  onClick={verifyAndCreate}
                  data-testid="register-button"
                >
                  Verify &amp; create account
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setStep("credentials")
                setError(null)
                setSent(false)
                setHint(null)
                setCode("")
              }}
              className="text-center text-ui-fg-subtle text-small-regular mt-2 underline"
            >
              Back
            </button>
          </div>
        )}
        <span className="text-center text-ui-fg-base text-small-regular mt-6">
          By creating an account, you agree to our{" "}
          <LocalizedClientLink
            href="/content/privacy-policy"
            className="underline"
          >
            Privacy Policy
          </LocalizedClientLink>{" "}
          and{" "}
          <LocalizedClientLink
            href="/content/terms-of-use"
            className="underline"
          >
            Terms of Use
          </LocalizedClientLink>
          .
        </span>
      </div>
      <GoogleSignIn />
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Already a member?{" "}
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

export default Register
