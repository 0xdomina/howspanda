"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Input from "@modules/common/components/input"
import Button from "@modules/common/components/button"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import GoogleSignIn from "@modules/account/components/google-signin"
import { signup } from "@lib/data/customer"
import { requestAuthOtp } from "@lib/data/auth-otp"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const RESEND_SECONDS = 45

const OtpBoxes = ({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) => {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const handle = (idx: number, v: string) => {
    const digit = v.replace(/\D/g, "").slice(-1)
    const next = value.split("")
    while (next.length < 6) next.push("")
    next[idx] = digit
    const joined = next.join("").slice(0, 6)
    onChange(joined)
    if (digit && idx < 5) refs.current[idx + 1]?.focus()
  }
  const onKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[idx] && idx > 0) {
      refs.current[idx - 1]?.focus()
    }
  }
  const onPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (pasted) {
      e.preventDefault()
      onChange(pasted)
      refs.current[Math.min(pasted.length, 5)]?.focus()
    }
  }
  return (
    <div className="flex justify-center gap-2" onPaste={onPaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={value[i] ?? ""}
          onChange={(e) => handle(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          inputMode="numeric"
          autoComplete="one-time-code"
          disabled={disabled}
          className="h-12 w-11 rounded-control border border-ink-hairline bg-white text-center text-lg font-semibold tracking-widest text-ink shadow-sm outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
          data-testid={i === 0 ? "otp-input" : `otp-input-${i}`}
        />
      ))}
    </div>
  )
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
  const [cooldown, setCooldown] = useState(0)

  // countdown for resend
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const sendCode = async () => {
    if (cooldown > 0) return false
    setError(null)
    const res = await requestAuthOtp({
      email: email.trim(),
      purpose: "signup",
    })
    if (!res.ok) {
      setError(res.error ?? "Could not send the code. Check your email and try again.")
      return false
    }
    setSent(true)
    setCooldown(RESEND_SECONDS)
    setHint(`We sent a 6-digit code to ${email.trim()}. It expires in 15 minutes.`)
    return true
  }

  const requestCode = () => {
    if (cooldown > 0 || isPending) return
    startTransition(async () => {
      await sendCode()
    })
  }

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
    startTransition(async () => {
      // Request only after the account details are valid. If the email is
      // already registered, the API returns a clear conflict and the user
      // stays on this step without receiving an unnecessary OTP.
      const delivered = await sendCode()
      if (delivered) setStep("code")
    })
  }

  const verifyAndCreate = () => {
    setError(null)
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit code.")
      return
    }
    startTransition(async () => {
      const formData = new FormData()
      formData.set("email", email.trim())
      formData.set("password", password)
      formData.set("code", code.trim())
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
        Create your account and set up your profile to shop from people, sell
        what you make, and deliver orders around you.
      </p>
      <div className="w-full flex flex-col">
        {step === "credentials" ? (
          <div className="flex flex-col gap-y-2 animate-[fadeIn_0.4s_ease]">
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
          <div className="flex flex-col gap-y-3 rounded-control border border-ink-hairline bg-white/70 p-5 shadow-sm backdrop-blur animate-[fadeIn_0.45s_ease]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Verify your email</p>
              <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-ink-muted">
                step 2 of 2
              </span>
            </div>
            <p className="text-sm text-ui-fg-subtle">
              We sent a code to{" "}
              <span className="font-medium text-ink">{email.trim()}</span>. Enter
              it below — it expires in 15 minutes.
            </p>

            <div className="pt-2">
              <OtpBoxes value={code} onChange={setCode} disabled={isPending} />
              {/* hidden single input for password managers */}
              <input
                type="hidden"
                name="code"
                value={code}
                readOnly
                data-testid="otp-input"
              />
            </div>

            {hint && (
              <p className="text-center text-xs text-emerald-700 animate-[fadeIn_0.3s_ease]">
                {hint}
              </p>
            )}
            <ErrorMessage error={error} data-testid="register-error" />

            <Button
              size="large"
              className="w-full mt-1"
              isLoading={isPending}
              disabled={code.trim().length !== 6}
              onClick={verifyAndCreate}
              data-testid="register-button"
            >
              Verify &amp; create account
            </Button>

            <div className="flex items-center justify-center gap-2 text-xs text-ink-muted">
              <span>Didn&apos;t get the code?</span>
              <button
                type="button"
                disabled={cooldown > 0 || isPending}
                onClick={requestCode}
                className="font-medium text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink disabled:opacity-40"
                data-testid="register-send-code-button"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : sent ? "Resend code" : isPending ? "Sending…" : "Send again"}
              </button>
            </div>
            {sent && (
              <p className="text-center text-[11px] leading-4 text-ink-muted">
                Check Spam or Promotions if the message is not in your inbox.
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setStep("credentials")
                setError(null)
                setSent(false)
                setHint(null)
                setCode("")
                setCooldown(0)
              }}
              className="text-center text-small-regular text-ui-fg-subtle underline"
            >
              Back — edit details
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
