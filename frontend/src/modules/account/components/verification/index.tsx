"use client"

import { useState, useTransition } from "react"

import {
  requestKycOtp,
  verifyKycOtp,
  submitKycIdentity,
  type KycProfileView,
} from "@lib/data/kyc"

const steps: {
  key: "email" | "phone" | "identity"
  label: string
  done: (kyc: KycProfileView | null) => boolean
  unlocks: string
}[] = [
  {
    key: "email",
    label: "Verify your email",
    done: (kyc) => !!kyc?.email_verified,
    unlocks: "Create orders and receive payments",
  },
  {
    key: "phone",
    label: "Add your phone number",
    done: (kyc) => !!kyc?.phone_verified,
    unlocks: "Make delivery offers and pickups",
  },
  {
    key: "identity",
    label: "Verify your identity",
    done: (kyc) => !!kyc?.id_status,
    unlocks: "Become a seller and take larger payouts",
  },
]

const EmailStep = ({
  email,
  onDone,
}: {
  email: string
  onDone: (p: KycProfileView) => void
}) => {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const send = () => {
    setError(null)
    startTransition(async () => {
      const res = await requestKycOtp({
        email,
        channel: "email",
        destination: email,
      })
      if (res.ok) {
        setSent(true)
        setHint(
          res.code
            ? `Dev code sent: ${res.code}`
            : "A verification code was sent to your email."
        )
      } else {
        setError(res.error ?? "Could not send the code.")
      }
    })
  }

  const verify = () => {
    setError(null)
    startTransition(async () => {
      const res = await verifyKycOtp({
        email,
        channel: "email",
        destination: email,
        code: code.trim(),
      })
      if (res.ok && res.profile) {
        onDone(res.profile)
      } else {
        setError(res.error ?? "Could not verify the code.")
      }
    })
  }

  return (
    <div className="space-y-3">
      {!sent ? (
        <button
          type="button"
          disabled={isPending}
          onClick={send}
          className="rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {isPending ? "Sending…" : "Send code to my email"}
        </button>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            Enter the 6-digit code sent to {email}.
          </p>
          <input
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))
            }
            inputMode="numeric"
            placeholder="••••••"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
          <button
            type="button"
            disabled={code.length !== 6 || isPending}
            onClick={verify}
            className="rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
          >
            {isPending ? "Verifying…" : "Verify"}
          </button>
        </>
      )}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  )
}

const PhoneStep = ({
  email,
  phone,
  onDone,
}: {
  email: string
  phone: string
  onDone: (p: KycProfileView) => void
}) => {
  const [number, setNumber] = useState(phone)
  const [code, setCode] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const send = () => {
    setError(null)
    if (number.replace(/[^\d+]/g, "").length < 7) {
      setError("Enter a valid phone number.")
      return
    }
    startTransition(async () => {
      const res = await requestKycOtp({
        email,
        channel: "phone",
        destination: number.trim(),
      })
      if (res.ok) {
        setSent(true)
        setHint(
          res.code
            ? `Dev code sent: ${res.code}`
            : "A verification code was sent to your phone."
        )
      } else {
        setError(res.error ?? "Could not send the code.")
      }
    })
  }

  const verify = () => {
    setError(null)
    startTransition(async () => {
      const res = await verifyKycOtp({
        email,
        channel: "phone",
        destination: number.trim(),
        code: code.trim(),
      })
      if (res.ok && res.profile) {
        onDone(res.profile)
      } else {
        setError(res.error ?? "Could not verify the code.")
      }
    })
  }

  return (
    <div className="space-y-3">
      <input
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        inputMode="tel"
        placeholder="+234…"
        className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
      />
      {!sent ? (
        <button
          type="button"
          disabled={isPending}
          onClick={send}
          className="rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {isPending ? "Sending…" : "Send code to my phone"}
        </button>
      ) : (
        <>
          <input
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))
            }
            inputMode="numeric"
            placeholder="••••••"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
          <button
            type="button"
            disabled={code.length !== 6 || isPending}
            onClick={verify}
            className="rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
          >
            {isPending ? "Verifying…" : "Verify"}
          </button>
        </>
      )}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  )
}

const IdentityStep = ({
  email,
  onDone,
}: {
  email: string
  onDone: (p: KycProfileView) => void
}) => {
  const [nin, setNin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    if (nin.replace(/\D/g, "").length !== 11) {
      setError("NIN must be an 11-digit number.")
      return
    }
    startTransition(async () => {
      const res = await submitKycIdentity({
        email,
        id_type: "nin",
        id_number: nin.trim(),
      })
      if (res.ok && res.profile) {
        onDone(res.profile)
      } else {
        setError(res.error ?? "Could not submit your identity.")
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Enter your National Identification Number (NIN). Only the last 4 digits
        are stored — nothing else is kept.
      </p>
      <input
        value={nin}
        onChange={(e) => setNin(e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
        inputMode="numeric"
        placeholder="11-digit NIN"
        className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
      />
      <button
        type="button"
        disabled={nin.length !== 11 || isPending}
        onClick={submit}
        className="rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Submitting…" : "Submit NIN"}
      </button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  )
}

const VerificationClient = ({
  email,
  phone,
  kyc,
}: {
  email: string
  phone: string
  kyc: KycProfileView | null
}) => {
  const [profile, setProfile] = useState<KycProfileView | null>(kyc)

  const done = (step: (typeof steps)[number]["key"]) =>
    steps.find((s) => s.key === step)!.done(profile)

  return (
    <div data-testid="verification-page" className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Verification
      </h2>
      <p className="text-sm text-ink-muted">
        Progressively verify your identity. Each level unlocks more ways to take
        part in the marketplace — order, deliver, then sell.
      </p>

      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li
            key={step.key}
            className={`rounded-large border p-5 ${
              done(step.key)
                ? "border-emerald-600/30 bg-emerald-600/5"
                : "border-ink-hairline bg-paper-surface"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink/5 text-xs font-semibold text-ink">
                    {i + 1}
                  </span>
                  <h3 className="text-sm font-medium text-ink">{step.label}</h3>
                </div>
                <p className="mt-1 text-xs text-ink-muted">Unlocks: {step.unlocks}</p>
              </div>
              {done(step.key) && (
                <span className="shrink-0 rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  {step.key === "identity" &&
                  profile?.id_status === "pending"
                    ? "Pending review"
                    : "Done"}
                </span>
              )}
            </div>

            {!done(step.key) && (
              <div className="mt-4">
                {step.key === "email" && (
                  <EmailStep
                    email={email}
                    onDone={(p) => setProfile(p)}
                  />
                )}
                {step.key === "phone" && (
                  <PhoneStep
                    email={email}
                    phone={phone}
                    onDone={(p) => setProfile(p)}
                  />
                )}
                {step.key === "identity" && (
                  <IdentityStep email={email} onDone={(p) => setProfile(p)} />
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

export default VerificationClient
