"use client"

import { useEffect, useMemo, useState, useTransition } from "react"

import { NIGERIAN_BANKS, bankNameToCode } from "@lib/data/banks"
import { reverseGeocode } from "@lib/data/delivery"
import {
  type KycFeatures,
  type KycProfileView,
} from "@lib/data/kyc"
import { requestKycOtp, verifyKycOtp, submitKycIdentity } from "@lib/data/kyc-actions"
import { saveMyKycProfile } from "@lib/data/kyc-profile"
import { addWithdrawalAccount } from "@lib/data/wallet"
import {
  preprocessImage,
  cleanOcrLines,
  extractFromLines,
  type ExtractedNinDoc,
} from "@lib/ocr/id-card"

type StepKey = "email" | "profile" | "identity"

type StepDef = {
  key: StepKey
  label: string
  done: (kyc: KycProfileView | null) => boolean
  unlocks: string
}

const baseSteps: StepDef[] = [
  {
    key: "email",
    label: "Verify your email",
    done: (kyc) => !!kyc?.email_verified,
    unlocks: "Create orders and receive payments",
  },
  {
    key: "profile",
    label: "Complete your profile",
    done: (kyc) =>
      kyc?.level === "profile_completed" || kyc?.level === "identity_verified",
    unlocks: "Set up your store and manage seller features",
  },
]

// The identity rung is shown when NIN verification is enabled on the server.
const identityStep: StepDef = {
  key: "identity",
  label: "Verify your identity (NIN)",
  done: (kyc) => kyc?.id_status === "verified",
  unlocks: "Apply, offer, and earn as a courier",
}

const buildSteps = (features: KycFeatures): StepDef[] =>
  features.nin_verification ? [...baseSteps, identityStep] : baseSteps

const inputClass =
  "w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"

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
  const [cooldown, setCooldown] = useState(0)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const send = () => {
    if (cooldown > 0 || isPending) return
    setError(null)
    startTransition(async () => {
      const res = await requestKycOtp({
        email,
        channel: "email",
        destination: email,
      })
      if (res.ok) {
        setSent(true)
        setCooldown(45)
        setHint(`We sent a 6-digit code to ${email}. It expires in 15 minutes.`)
      } else {
        setError(res.error ?? "Could not send the code. Check your email and try again.")
      }
    })
  }

  useEffect(() => {
    if (!sent) send()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        setError(res.error ?? "Incorrect code. Check your inbox and try again.")
      }
    })
  }

  return (
    <div className="space-y-3 rounded-control border border-ink-hairline bg-white/70 p-4 shadow-sm backdrop-blur animate-[fadeIn_0.4s_ease]">
      <p className="text-sm font-medium text-ink">Verify your email</p>
      <p className="text-sm text-ink-muted">
        {sent
          ? `We sent a code to ${email}. Enter it below.`
          : `Sending a code to ${email}…`}
      </p>
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <input
            key={i}
            value={code[i] ?? ""}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(-1)
              const next = code.split("")
              while (next.length < 6) next.push("")
              next[i] = d
              const joined = next.join("").slice(0, 6)
              setCode(joined)
              if (d && i < 5) {
                const nxt = document.getElementById(`kyc-otp-${i + 1}`) as HTMLInputElement | null
                nxt?.focus()
              }
            }}
            id={`kyc-otp-${i}`}
            inputMode="numeric"
            className="h-11 w-10 rounded-control border border-ink-hairline bg-white text-center text-lg font-semibold text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
          />
        ))}
      </div>
      {/* single hidden input for tests */}
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={code.length !== 6 || isPending}
          onClick={verify}
          className="rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {isPending ? "Verifying…" : "Verify"}
        </button>
        <button
          type="button"
          disabled={cooldown > 0 || isPending}
          onClick={send}
          className="text-xs font-medium text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink disabled:opacity-40"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : sent ? "Resend code" : "Sending…"}
        </button>
      </div>
      {hint && <p className="text-xs text-emerald-700">{hint}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <p className="text-[11px] text-ink-muted">Tip: check Spam / Promotions and add no-reply@howsu.com to contacts.</p>
    </div>
  )
}

// Personal profile rung: names exactly as on the ID card plus residence
// address. Filling these after email verification reaches profile_completed,
// which unlocks seller setup. The optional bank account is where
// withdrawals land; postal code is suggested from the device location but can
// be overridden or left blank.
const ProfileStep = ({
  email,
  phone,
  kyc,
  customerName,
  onDone,
}: {
  email: string
  phone?: string | null
  kyc: KycProfileView | null
  customerName?: { first_name?: string | null; last_name?: string | null }
  onDone: (p: KycProfileView) => void
}) => {
  const nameParts = (customerName?.first_name ?? "").trim().split(/\s+/)
  const [form, setForm] = useState({
    first_name: kyc?.first_name ?? nameParts[0] ?? "",
    last_name: kyc?.last_name ?? (customerName?.last_name ?? nameParts.slice(1).join(" ")),
    phone: kyc?.phone ?? phone ?? "",
    other_name: kyc?.other_name ?? "",
    address: kyc?.address ?? "",
    country: kyc?.country ?? "",
    state: kyc?.state ?? "",
    city: kyc?.city ?? "",
    postal_code: kyc?.postal_code ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const [locHint, setLocHint] = useState<string | null>(null)
  const [bankName, setBankName] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [bankError, setBankError] = useState<string | null>(null)
  const [bankHint, setBankHint] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const suggestPostal = () => {
    setLocHint(null)
    if (!("geolocation" in navigator)) {
      setLocHint(
        "Location is not available on this device — enter the postal code manually or leave it blank."
      )
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        const result = await reverseGeocode(latitude, longitude)
        if (result?.postcode) {
          setForm((f) => ({ ...f, postal_code: result.postcode! }))
          setLocHint(
            `Suggested postal code ${result.postcode}. You can change or clear it.`
          )
        } else {
          setLocHint(
            "Couldn't detect a postal code from your location — enter it manually or leave it blank."
          )
        }
      },
      () => {
        setLocHint(
          "Location access was denied — enter the postal code manually or leave it blank."
        )
      }
    )
  }

  const submitProfile = () => {
    setError(null)
    if (form.phone.trim().length < 7) {
      setError("Enter a phone number so delivery contacts can reach you.")
      return
    }
    startTransition(async () => {
      const res = await saveMyKycProfile(form)
      if (res.ok && res.profile) {
        onDone(res.profile)
      } else {
        setError(res.error ?? "Could not save your profile.")
      }
    })
  }

  const addBank = () => {
    setBankError(null)
    const bankCode = bankNameToCode(bankName)
    if (!bankCode) {
      setBankError("Choose your bank from the list.")
      return
    }
    if (accountNumber.replace(/\D/g, "").length !== 10) {
      setBankError("Account number must be 10 digits.")
      return
    }
    startTransition(async () => {
      const res = await addWithdrawalAccount(email, {
        type: "bank_account",
        bank_code: bankCode,
        account_number: accountNumber.trim(),
      })
      if (res.success) {
        setBankName("")
        setAccountNumber("")
        setBankHint("Bank account added — this is where withdrawals will land.")
      } else {
        setBankError(res.error)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 small:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">First name (as on ID)</label>
          <input
            value={form.first_name}
            onChange={set("first_name")}
            placeholder="First name"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Last name (as on ID)</label>
          <input
            value={form.last_name}
            onChange={set("last_name")}
            placeholder="Last name"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Other name (optional)</label>
          <input
            value={form.other_name}
            onChange={set("other_name")}
            placeholder="Middle name"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink-muted">Phone number</label>
        <input
          value={form.phone}
          onChange={set("phone")}
          placeholder="e.g. 08012345678"
          type="tel"
          autoComplete="tel"
          required
          className={inputClass}
        />
        <p className="mt-1 text-xs text-ink-muted">
          Keep this number up to date for delivery contact. We do not send verification codes to phone numbers.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink-muted">Residence address</label>
        <input
          value={form.address}
          onChange={set("address")}
          placeholder="Street, area"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 small:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Country</label>
          <input
            value={form.country}
            onChange={set("country")}
            placeholder="e.g. NG"
            list="kyc-countries"
            className={inputClass}
          />
          <datalist id="kyc-countries">
            <option value="NG" />
            <option value="GH" />
            <option value="KE" />
            <option value="ZA" />
            <option value="US" />
            <option value="GB" />
            <option value="CA" />
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">State / region</label>
          <input
            value={form.state}
            onChange={set("state")}
            placeholder="e.g. Lagos"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">City</label>
          <input
            value={form.city}
            onChange={set("city")}
            placeholder="e.g. Ikeja"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink-muted">Postal code (optional)</label>
        <div className="flex gap-2">
          <input
            value={form.postal_code}
            onChange={set("postal_code")}
            placeholder="e.g. 100281"
            className={inputClass}
          />
          <button
            type="button"
            onClick={suggestPostal}
            className="shrink-0 rounded-medium border border-ink-strong px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-white"
          >
            Use my location
          </button>
        </div>
        {locHint && <p className="mt-1 text-xs text-ink-muted">{locHint}</p>}
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={submitProfile}
        className="rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save profile"}
      </button>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="mt-4 border-t border-ink-hairline pt-4">
        <p className="text-sm font-medium text-ink">Bank account for withdrawals</p>
        <p className="mt-1 text-xs text-ink-muted">
          Optional — add the bank where your earnings and payouts should land.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 small:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Bank name</label>
            <select
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className={inputClass}
            >
              <option value="">Select your bank…</option>
              {NIGERIAN_BANKS.map((bank) => (
                <option key={bank.code} value={bank.name}>
                  {bank.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Account number</label>
            <input
              value={accountNumber}
              onChange={(e) =>
                setAccountNumber(e.target.value.replace(/[^\d]/g, "").slice(0, 10))
              }
              placeholder="10-digit NUBAN"
              inputMode="numeric"
              className={inputClass}
            />
          </div>
        </div>
        {bankError && <p className="mt-2 text-sm text-rose-600">{bankError}</p>}
        {bankHint && <p className="mt-2 text-sm text-emerald-700">{bankHint}</p>}
        <button
          type="button"
          disabled={isPending}
          onClick={addBank}
          className="mt-3 rounded-medium border border-ink-strong px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
        >
          Add bank account
        </button>
      </div>
    </div>
  )
}

export const IdentityStep = ({
  email,
  kyc,
  onDone,
}: {
  email: string
  kyc: KycProfileView | null
  onDone: (p: KycProfileView) => void
}) => {
  const [mode, setMode] = useState<"upload" | "manual">("upload")
  const [image, setImage] = useState<string | null>(null)
  const [document, setDocument] = useState<File | null>(null)
  const [stage, setStage] = useState<"idle" | "scanning" | "review">("idle")
  const [progress, setProgress] = useState<number | null>(null)
  const [doc, setDoc] = useState<ExtractedNinDoc>({})
  const [nin, setNin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const setDocField =
    (key: keyof ExtractedNinDoc) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setDoc((d) => ({ ...d, [key]: e.target.value }))

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Choose an image of your ID card.")
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Choose an ID image smaller than 8 MB.")
      return
    }
    setDocument(file)
    const reader = new FileReader()
    reader.onload = () => setImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  // Everything runs in the browser: the photo is preprocessed (grayscale +
  // contrast), OCR'd with Tesseract.js (loaded on demand), and the cleaned text
  // is parsed into fields. The user reviews/corrects, then the JSON is sent to
  // the backend for the NIN match — no ID image ever leaves the device.
  const scan = () => {
    setError(null)
    setStage("scanning")
    setProgress(0)
    startTransition(async () => {
      try {
        const preprocessed = await preprocessImage(image!)
        const Tesseract = (await import("tesseract.js")).createWorker
        const worker = await Tesseract("eng", 1, {
          logger: (m: any) => {
            if (m.status === "recognizing text") {
              setProgress(Math.round(m.progress * 100))
            }
          },
        })
        const { data } = await worker.recognize(preprocessed)
        await worker.terminate()
        const extracted = extractFromLines(cleanOcrLines(data.text))
        // Fall back to the profile name so the user corrects, not retypes.
        setDoc({
          id_number: extracted.id_number ?? undefined,
          first_name: extracted.first_name ?? kyc?.first_name ?? undefined,
          last_name: extracted.last_name ?? kyc?.last_name ?? undefined,
          other_name: extracted.other_name ?? kyc?.other_name ?? undefined,
          date_of_birth: extracted.date_of_birth ?? undefined,
        })
        setStage("review")
      } catch {
        setStage("idle")
        setMode("manual")
        setError(
          "OCR couldn't load right now. Enter the NIN manually below — the details on your profile are used for the match."
        )
      }
    })
  }

  const reset = () => {
    setStage("idle")
    setImage(null)
    setDocument(null)
    setDoc({})
    setError(null)
  }

  const submitDoc = () => {
    setError(null)
    const idNumber = (doc.id_number ?? "").replace(/\D/g, "")
    if (idNumber.length !== 11) {
      setError("NIN must be an 11-digit number.")
      return
    }
    if (!document) {
      setError("Choose the ID card photo again before submitting.")
      return
    }
    const extracted = {
      id_number: idNumber,
      first_name: doc.first_name ?? undefined,
      last_name: doc.last_name ?? undefined,
      other_name: doc.other_name ?? undefined,
      date_of_birth: doc.date_of_birth ?? undefined,
      country: doc.country ?? undefined,
      state: doc.state ?? undefined,
      city: doc.city ?? undefined,
      address: doc.address ?? undefined,
    }
    startTransition(async () => {
      const res = await submitKycIdentity({
        email,
        id_type: "nin",
        id_number: idNumber,
        document: document ?? undefined,
        extracted,
      })
      if (res.ok && res.profile) {
        onDone(res.profile)
      } else {
        setError(res.error ?? "Could not submit your identity.")
      }
    })
  }

  const submitManual = () => {
    setError(null)
    const idNumber = nin.replace(/\D/g, "")
    if (idNumber.length !== 11) {
      setError("NIN must be an 11-digit number.")
      return
    }
    startTransition(async () => {
      const res = await submitKycIdentity({
        email,
        id_type: "nin",
        id_number: idNumber,
        document: document ?? undefined,
        // The match checks the card's name against the profile — in manual
        // mode the card isn't scanned, so the profile name stands in.
        extracted: {
          id_number: idNumber,
          first_name: kyc?.first_name ?? undefined,
          last_name: kyc?.last_name ?? undefined,
        },
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
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded-medium px-3 py-1.5 text-sm font-medium ${
            mode === "upload"
              ? "bg-ink text-white"
              : "border border-ink-strong text-ink hover:bg-ink hover:text-white"
          }`}
        >
          Upload ID card
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-medium px-3 py-1.5 text-sm font-medium ${
            mode === "manual"
              ? "bg-ink text-white"
              : "border border-ink-strong text-ink hover:bg-ink hover:text-white"
          }`}
        >
          Enter NIN manually
        </button>
      </div>

      {mode === "upload" && stage === "idle" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Upload a clear photo of your National ID card. We&rsquo;ll use it to
            help complete your details before you submit them for review.
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={onFile}
            className="block w-full text-sm text-ink file:mr-3 file:rounded-medium file:border-0 file:bg-ink/5 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
          {image && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt="Selected ID card"
                className="h-24 w-40 rounded-medium border border-ink-hairline object-cover"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={scan}
                className="rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
              >
                Scan and review
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "upload" && stage === "scanning" && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">Reading the ID card…</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-ink transition-all"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-ink-muted">{progress ?? 0}%</p>
        </div>
      )}

      {mode === "upload" && stage === "review" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Confirm the details read off your card — fix anything the scanner
            got wrong, then submit.
          </p>
          <div className="grid grid-cols-1 gap-3 small:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-ink-muted">NIN</label>
              <input
                value={doc.id_number ?? ""}
                onChange={setDocField("id_number")}
                inputMode="numeric"
                placeholder="11-digit NIN"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-muted">Date of birth (optional)</label>
              <input
                value={doc.date_of_birth ?? ""}
                onChange={setDocField("date_of_birth")}
                placeholder="e.g. 12/05/1990"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-muted">First name</label>
              <input
                value={doc.first_name ?? ""}
                onChange={setDocField("first_name")}
                placeholder="First name"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-muted">Last name</label>
              <input
                value={doc.last_name ?? ""}
                onChange={setDocField("last_name")}
                placeholder="Last name"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-muted">Other name (optional)</label>
              <input
                value={doc.other_name ?? ""}
                onChange={setDocField("other_name")}
                placeholder="Middle name"
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={submitDoc}
              className="rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
            >
              {isPending ? "Submitting…" : "Submit identity"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-medium border border-ink-strong px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-white"
            >
              Rescan
            </button>
          </div>
        </div>
      )}

      {mode === "manual" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Enter your National Identification Number (NIN). Manual entries
            stay pending review; uploading a card photo enables automatic file
            validation.
          </p>
          <input
            value={nin}
            onChange={(e) => setNin(e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
            inputMode="numeric"
            placeholder="11-digit NIN"
            className={inputClass}
          />
          <button
            type="button"
            disabled={nin.length !== 11 || isPending}
            onClick={submitManual}
            className="rounded-medium bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
          >
            {isPending ? "Submitting…" : "Submit NIN"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  )
}

export const ProfileIdentityVerification = ({
  email,
  kyc,
}: {
  email: string
  kyc: KycProfileView | null
}) => {
  const [profile, setProfile] = useState<KycProfileView | null>(kyc)
  const status = profile?.id_status ?? "none"

  return (
    <section
      id="identity-verification"
      className="rounded-control border border-ink-hairline bg-paper-surface p-5"
      data-testid="profile-identity-verification"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-ink">Identity and courier access</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Upload your ID card here. Once it is approved, this same account can use courier features.
          </p>
        </div>
        {status !== "none" && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === "verified" ? "bg-emerald-600/10 text-emerald-700" : status === "pending" ? "bg-amber-600/10 text-amber-800" : "bg-ink/10 text-ink-muted"}`}>
            {status === "verified" ? "Verified" : status === "pending" ? "Pending review" : "Not submitted"}
          </span>
        )}
      </div>

      {status === "verified" ? (
        <p className="mt-4 rounded-medium bg-emerald-600/5 p-3 text-sm text-emerald-800">
          Your identity is verified. Courier access is available from this account.
        </p>
      ) : status === "pending" ? (
        <p className="mt-4 rounded-medium bg-amber-600/5 p-3 text-sm text-amber-900">
          Your ID is being reviewed. Courier access will open after approval.
        </p>
      ) : (
        <div className="mt-5">
          <IdentityStep email={email} kyc={profile} onDone={setProfile} />
        </div>
      )}
    </section>
  )
}

const VerificationClient = ({
  email,
  phone,
  kyc,
  features,
  customerName,
}: {
  email: string
  phone: string
  kyc: KycProfileView | null
  features: KycFeatures
  customerName?: { first_name?: string | null; last_name?: string | null }
}) => {
  const [profile, setProfile] = useState<KycProfileView | null>(kyc)
  const steps = useMemo(() => buildSteps(features), [features])

  const done = (step: StepKey) =>
    steps.find((s) => s.key === step)!.done(profile)

  return (
    <div data-testid="verification-page" className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Verification
      </h2>
      <p className="text-sm text-ink-muted">
        Complete your profile to set up a store. A verified ID unlocks courier
        applications and delivery offers.
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
              {(done(step.key) ||
                (step.key === "identity" && profile?.id_status === "pending")) && (
                <span className="shrink-0 rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  {step.key === "identity" && profile?.id_status === "pending"
                    ? "Pending review"
                    : "Done"}
                </span>
              )}
            </div>

            {!done(step.key) &&
              !(step.key === "identity" && profile?.id_status === "pending") && (
              <div className="mt-4">
                {step.key === "email" && (
                  <EmailStep email={email} onDone={(p) => setProfile(p)} />
                )}
                {step.key === "profile" && (
                  <ProfileStep
                    email={email}
                    phone={phone}
                    kyc={profile}
                    customerName={customerName}
                    onDone={(p) => setProfile(p)}
                  />
                )}
                {step.key === "identity" && (
                  <IdentityStep
                    email={email}
                    kyc={profile}
                    onDone={(p) => setProfile(p)}
                  />
                )}
              </div>
            )}
            {step.key === "identity" && profile?.id_status === "pending" && (
              <p className="mt-4 text-sm text-ink-muted">
                Your ID document is being reviewed. Courier features will open
                as soon as verification is approved.
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

export default VerificationClient
