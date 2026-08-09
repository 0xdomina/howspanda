"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Input from "@modules/common/components/input"
import Button from "@modules/common/components/button"
import ErrorMessage from "@modules/checkout/components/error-message"
import { confirmEmailChange, requestEmailChange } from "@lib/data/account-security"
import { HttpTypes } from "@medusajs/types"

type MyInformationProps = {
  customer: HttpTypes.StoreCustomer
}

const ProfileEmail = ({ customer }: MyInformationProps) => {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [code, setCode] = useState("")
  const [sent, setSent] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const close = () => {
    setEditing(false)
    setNewEmail("")
    setCurrentPassword("")
    setCode("")
    setSent(false)
    setHint(null)
    setError(null)
  }

  const requestCode = () => {
    setError(null)
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes("@")) {
      setError("Enter a valid new email address.")
      return
    }
    if (!currentPassword) {
      setError("Enter your current password to continue.")
      return
    }

    startTransition(async () => {
      const result = await requestEmailChange({ newEmail: email, currentPassword })
      if (!result.ok) {
        setError(result.error ?? "We could not start the email change.")
        return
      }
      setSent(true)
      setHint(result.code ? `Verification code: ${result.code}` : `A verification code was sent to ${email}.`)
    })
  }

  const confirm = () => {
    setError(null)
    if (code.trim().length !== 6) {
      setError("Enter the six-digit verification code.")
      return
    }

    startTransition(async () => {
      const result = await confirmEmailChange({ newEmail: newEmail.trim().toLowerCase(), code: code.trim() })
      if (!result.ok) {
        setError(result.error ?? "We could not update your email.")
        return
      }
      setHint("Your email has been updated. You can keep using this account.")
      setCurrentPassword("")
      setCode("")
      setSent(false)
      router.refresh()
    })
  }

  return (
    <div className="w-full" data-testid="account-email-editor">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Email</span>
          <span className="font-semibold text-ink" data-testid="current-email">{customer.email}</span>
        </div>
        <Button type="button" variant="surface" onClick={() => (editing ? close() : setEditing(true))}>
          {editing ? "Cancel" : "Edit"}
        </Button>
      </div>

      {editing && <div className="mt-5 flex flex-col gap-4 border-t border-ink-hairline pt-5">
        {!sent ? <>
          <p className="text-sm leading-6 text-ink-muted">Verify your new email and current password to keep your account secure.</p>
          <Input name="new_email" label="New email" type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} data-testid="new-email-input" />
          <Input name="current_password" label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} data-testid="current-password-input" />
          <Button type="button" isLoading={isPending} onClick={requestCode} data-testid="request-email-change-button">Send verification code</Button>
        </> : <>
          <p className="text-sm leading-6 text-ink-muted">Enter the code sent to {newEmail.trim().toLowerCase()}.</p>
          <Input name="email_change_code" label="Verification code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/[^\d]/g, "").slice(0, 6))} data-testid="email-change-otp-input" />
          {hint && <p className="text-xs text-ink-muted">{hint}</p>}
          <Button type="button" isLoading={isPending} disabled={code.length !== 6} onClick={confirm} data-testid="confirm-email-change-button">Update email</Button>
          <button type="button" className="text-left text-sm text-ink-muted underline" onClick={() => { setSent(false); setCode(""); setHint(null) }}>Use a different email</button>
        </>}
        {error && <ErrorMessage error={error} data-testid="email-change-error" />}
      </div>}
    </div>
  )
}

export default ProfileEmail
