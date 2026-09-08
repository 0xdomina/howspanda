"use client"

import { useActionState, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  activateSellerIdentity,
  bridgeLoginOrSendCode,
  upgradeCustomerToSeller,
} from "@lib/data/seller"
import type { KycProfileView } from "@lib/data/kyc"
import Input from "@modules/common/components/input"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type SellerSetupTemplateProps = {
  customer: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
  }
  kyc: KycProfileView | null
  profileComplete?: boolean
  needsBridge?: boolean
}

// Password-only accounts verify their email once to activate the store
// login (creates the Medusa customer + session). After that the normal
// profile gate and store setup apply.
function SellerBridgeForm({ customer }: { customer: SellerSetupTemplateProps["customer"] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState(customer.first_name ?? "")
  const [lastName, setLastName] = useState(customer.last_name ?? "")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")

  const sendCode = () =>
    startTransition(async () => {
      setError(null)
      // Login-first: most users already have a store login from signup, so
      // the account password alone unlocks selling — no code needed.
      const res = await bridgeLoginOrSendCode({
        email: customer.email ?? "",
        password,
        firstName,
        lastName,
        phone,
      })
      if ("ok" in res) {
        router.refresh()
        return
      }
      if ("error" in res) {
        setError(res.error)
        return
      }
      setSent(true)
    })

  const activate = () =>
    startTransition(async () => {
      setError(null)
      const err = await activateSellerIdentity({
        email: customer.email ?? "",
        password,
        code,
        firstName,
        lastName,
        phone,
      })
      if (err) {
        setError(err)
        return
      }
      router.refresh()
    })

  return (
    <div className="mt-8 rounded-control border border-ink-hairline bg-paper-tinted p-5" data-testid="seller-bridge-form">
      <h2 className="font-display text-xl font-medium text-ink">One quick step to unlock selling</h2>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        Enter your account password for {customer.email} — in most cases
        that&rsquo;s all it takes. If your store login isn&rsquo;t set up yet,
        we&rsquo;ll send a quick email code instead.
      </p>
      <div className="mt-4 grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First name" name="bridge_first_name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          <Input label="Last name" name="bridge_last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
        </div>
        <Input label="Phone number" name="bridge_phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" />
        <Input label="Your account password" name="bridge_password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
        {!sent ? (
          <button
            type="button"
            onClick={sendCode}
            disabled={isPending || !password}
            className="figma-button mt-1 inline-flex w-fit disabled:opacity-50"
            data-testid="seller-bridge-send-code"
          >
            {isPending ? "Checking…" : "Continue"}
          </button>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              We sent a 6-digit code to {customer.email}. It expires in 15 minutes.
            </p>
            <Input label="6-digit code" name="bridge_code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
            <button
              type="button"
              onClick={activate}
              disabled={isPending || code.length !== 6}
              className="figma-button mt-1 inline-flex w-fit disabled:opacity-50"
              data-testid="seller-bridge-activate"
            >
              {isPending ? "Activating…" : "Verify & continue"}
            </button>
          </>
        )}
      </div>
      <ErrorMessage error={error} data-testid="seller-bridge-error" />
    </div>
  )
}

export default function SellerSetupTemplate({
  customer,
  kyc,
  profileComplete = false,
  needsBridge = false,
}: SellerSetupTemplateProps) {
  const [message, formAction] = useActionState(upgradeCustomerToSeller, null)
  const canSell =
    profileComplete ||
    kyc?.level === "profile_completed" ||
    kyc?.level === "identity_verified"

  return (
    <div className="seller-workspace figma-container flex min-h-[calc(100vh-180px)] items-center justify-center py-12 small:py-20">
      <div className="figma-surface w-full max-w-[560px] rounded-[24px] p-6 small:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Seller setup</p>
        <h1 className="mt-3 font-display text-3xl font-medium tracking-[-0.02em] text-ink small:text-4xl">
          Turn your How’s U account into a store
        </h1>
        <p className="mt-4 max-w-lg text-base-regular leading-7 text-ink-muted">
          {customer.first_name ? `Hi ${customer.first_name}. ` : ""}Your How’s U account can shop, sell, and deliver. Complete your profile once, then set up a store whenever you are ready.
        </p>
        {needsBridge && !canSell ? (
          <SellerBridgeForm customer={customer} />
        ) : !canSell ? (
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
