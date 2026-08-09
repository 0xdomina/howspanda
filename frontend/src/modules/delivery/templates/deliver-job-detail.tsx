"use client"

import { useTransition, useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import RouteMap from "@modules/delivery/components/route-map"
import { getDisplayName } from "@lib/util/name"
import {
  makeOffer,
  markPickedUp,
  generateVerification,
  submitVerification,
  confirmDelivery,
  cancelDeliveryJob,
  listDeliveryMessages,
  sendDeliveryMessage,
} from "@lib/data/delivery"

const ngn = (v: number | string | undefined) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0))

const statusLabel: Record<string, string> = {
  open: "Open for offers",
  negotiating: "Negotiating",
  accepted: "Accepted",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

const Section = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) => (
  <div className="figma-surface p-4">
    <h3 className="font-display text-lg font-medium text-ink">{title}</h3>
    <div className="mt-3">{children}</div>
  </div>
)

const SignInPrompt = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-medium border border-ink-hairline bg-paper-surface p-3">
    <p className="text-xs text-ink-muted">{children}</p>
    <LocalizedClientLink
      href="/account"
      className="mt-2 block w-full rounded-medium bg-ink px-3 py-2 text-center text-sm font-medium text-white hover:bg-ink/90"
    >
      Sign in to continue
    </LocalizedClientLink>
  </div>
)

// Identity comes from the signed-in account (customer or seller), never from a
// free-text email. Offer and pickup are courier actions gated on an approved
// courier application + a completed KYC profile server-side.
const DeliverJobDetailClient = ({
  job,
  customer,
}: {
  job: any
  customer: { email?: string | null; first_name?: string | null; last_name?: string | null } | null
}) => {
  const email = customer?.email?.trim().toLowerCase() ?? ""
  const isSignedIn = !!email
  const displayName = getDisplayName(customer)
  const [price, setPrice] = useState("")
  const [code, setCode] = useState("")
  const [codePurpose, setCodePurpose] = useState<"pickup" | "delivery">("pickup")
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [chatBody, setChatBody] = useState("")
  const [messages, setMessages] = useState<any[]>(job.messages ?? [])
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const parties = job.parties ?? []
  const offers = job.offers ?? []
  const myParty = parties.find((p: any) => p.email === email)
  const acceptedOffer = offers.find((o: any) => o.status === "accepted")
  const isCourier = myParty?.role === "courier"
  const isSender = myParty?.role === "sender"
  const isRecipient = myParty?.role === "recipient"

  // People are identified by their proper name — never by any part of their
  // email. Without a name we fall back to the party's role, and own messages
  // are always labelled "You".
  const partyLabel = (partyEmail: string) => {
    const e = partyEmail.trim().toLowerCase()
    if (e === email) return "You"
    const party = parties.find(
      (p: any) => (p.email ?? "").trim().toLowerCase() === e
    )
    if (party?.name) return party.name
    const roleLabel: Record<string, string> = {
      courier: "Courier",
      sender: "Sender",
      recipient: "Recipient",
    }
    return roleLabel[party?.role] ?? "Participant"
  }

  const setMsg = (s: string | null) => setMessage(s)
  const guard = () => {
    if (!isSignedIn) {
      setMsg("Sign in with your account first.")
      return false
    }
    return true
  }

  const offer = () => {
    setMsg(null)
    if (!guard()) return
    const amount = Number(price)
    if (!Number.isFinite(amount) || amount <= 0) return setMsg("Enter a valid amount.")
    startTransition(async () => {
      const res = await makeOffer(job.id, amount)
      setMsg(res.success ? "Offer sent! Waiting on the store owner." : res.error)
    })
  }

  const pickup = () => {
    setMsg(null)
    if (!guard()) return
    startTransition(async () => {
      const res = await markPickedUp(job.id)
      setMsg(res.success ? "Pickup confirmed — package in transit." : res.error)
    })
  }

  const genCode = (purpose: "pickup" | "delivery") => {
    setMsg(null)
    if (!guard()) return
    startTransition(async () => {
      const res = await generateVerification(job.id, purpose, email)
      if (res.success && res.code) {
        setGeneratedCode(`${purpose === "pickup" ? "Pickup" : "Delivery"} code: ${res.code}`)
        setMsg("Show this code to the other party — it expires in 15 minutes.")
      } else {
        setGeneratedCode(null)
        setMsg(res.error)
      }
    })
  }

  const verify = () => {
    setMsg(null)
    if (!guard()) return
    if (!/^\d{6}$/.test(code)) return setMsg("The code is 6 digits.")
    startTransition(async () => {
      const res = await submitVerification(job.id, email, code, codePurpose)
      setMsg(res.success ? "Verified!" : res.error)
    })
  }

  const confirm = () => {
    setMsg(null)
    if (!guard()) return
    startTransition(async () => {
      const res = await confirmDelivery(
        job.id,
        email,
        isCourier ? email : undefined
      )
      setMsg(
        res.success
          ? "Delivery confirmed — the courier payout is released."
          : res.error
      )
    })
  }

  const cancel = () => {
    setMsg(null)
    if (!guard()) return
    if (!cancelReason.trim()) return setMsg("Add a reason to cancel.")
    startTransition(async () => {
      const res = await cancelDeliveryJob(job.id, email, cancelReason.trim())
      setMsg(res.success ? "Job cancelled." : res.error)
    })
  }

  const loadChat = () => {
    setMsg(null)
    if (!guard()) return
    startTransition(async () => {
      const msgs = await listDeliveryMessages(job.id, email)
      setMessages(msgs)
    })
  }

  const sendMsg = () => {
    setMsg(null)
    if (!guard()) return
    if (!chatBody.trim()) return setMsg("Write a message first.")
    startTransition(async () => {
      const res = await sendDeliveryMessage(job.id, email, chatBody.trim())
      if (res.success) {
        setChatBody("")
        const msgs = await listDeliveryMessages(job.id, email)
        setMessages(msgs)
      } else {
        setMsg(res.error)
      }
    })
  }

  return (
    <div data-testid="deliver-job-page" className="figma-container flex-1 py-10 small:py-16">
      <div className="mb-6">
        <LocalizedClientLink
          href="/deliver"
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← All delivery jobs
        </LocalizedClientLink>
      </div>

      <div className="flex flex-col gap-6 small:flex-row small:items-start">
        <div className="flex-1 space-y-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
                {job.package_description}
              </h1>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                  job.status === "delivered"
                    ? "bg-emerald-50 text-emerald-700"
                    : job.status === "cancelled"
                    ? "bg-rose-50 text-rose-700"
                    : "bg-ink/10 text-ink"
                }`}
              >
                {statusLabel[job.status] ?? job.status}
              </span>
            </div>
            <div className="mt-3 space-y-1.5 rounded-medium bg-ink/5 p-4 text-sm">
              <p className="text-ink">
                <span className="text-ink-muted">Pickup:</span> {job.pickup_address}
              </p>
              <p className="text-ink">
                <span className="text-ink-muted">Deliver to:</span> {job.destination_address}
              </p>
              {job.destination_phone && (
                <p className="text-ink">
                  <span className="text-ink-muted">Recipient phone:</span> {job.destination_phone}
                </p>
              )}
              {job.courier_phone && (
                <p className="text-ink">
                  <span className="text-ink-muted">Courier phone:</span>{" "}
                  <a href={`tel:${job.courier_phone}`} className="underline underline-offset-2">
                    {job.courier_phone}
                  </a>
                </p>
              )}
              {job.package_weight && (
                <p className="text-ink">
                  <span className="text-ink-muted">Weight:</span> {job.package_weight}
                </p>
              )}
              <p className="font-mono tabular-nums text-ink">
                <span className="font-sans text-ink-muted">Posted:</span> {ngn(job.posted_price)}
              </p>
              {acceptedOffer && (
                <p className="font-mono tabular-nums text-ink">
                  <span className="font-sans text-ink-muted">Locked:</span>{" "}
                  {ngn(acceptedOffer.offered_price)}
                </p>
              )}
            </div>
            {job.pickup_lat != null &&
              job.pickup_lng != null &&
              job.destination_lat != null &&
              job.destination_lng != null && (
                <div className="mt-4">
                  <RouteMap
                    points={[
                      {
                        lat: Number(job.pickup_lat),
                        lng: Number(job.pickup_lng),
                        label: "Pickup",
                        kind: "pickup",
                      },
                      {
                        lat: Number(job.destination_lat),
                        lng: Number(job.destination_lng),
                        label: "Destination",
                        kind: "destination",
                      },
                    ]}
                    height={300}
                  />
                  {job.pickup_distance_km != null && (
                    <p className="mt-1 text-xs text-ink-muted">
                      Pickup is {job.pickup_distance_km.toFixed(1)} km from your
                      search location.
                    </p>
                  )}
                </div>
              )}
          </div>

          {offers.length > 0 && (
            <Section title={`Offers (${offers.length})`}>
              <ul className="divide-y divide-ink-hairline">
                {offers.map((o: any) => (
                  <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="truncate text-ink-muted">
                      {o.courier_name ??
                        (o.courier_email?.trim().toLowerCase() === email
                          ? "You"
                          : "Courier")}
                    </span>
                    <span className="ml-2 flex items-center gap-2">
                      <span className="font-mono tabular-nums text-ink">
                        {ngn(o.offered_price)}
                      </span>
                      <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs">
                        {o.status}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Chat">
            <p className="text-xs text-ink-muted">
              Messages are shown to the sender, courier, and recipient.
            </p>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-medium border border-ink-hairline p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-ink-muted">No messages yet.</p>
              ) : (
                messages.map((m: any) => (
                  <div key={m.id} className="text-sm">
                    {m.is_system ? (
                      <p className="italic text-ink-muted">{m.body}</p>
                    ) : (
                      <p className="text-ink">
                        <span className="font-medium text-ink-muted">
                          {m.is_system
                            ? "System"
                            : m.sender_name
                            ? m.sender_name
                            : partyLabel(m.sender_email)}
                          :
                        </span>{" "}
                        {m.body}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
            {isSignedIn ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={loadChat}
                  className="rounded-medium border border-ink-strong px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
                >
                  Load
                </button>
                <input
                  type="text"
                  value={chatBody}
                  onChange={(e) => setChatBody(e.target.value)}
                  placeholder="Write a message…"
                  className="flex-1 rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={sendMsg}
                  className="rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <SignInPrompt>Sign in to load or send messages.</SignInPrompt>
              </div>
            )}
          </Section>
        </div>

        <div className="w-full space-y-4 small:max-w-sm">
          <Section title="Your identity">
            <p className="text-xs text-ink-muted">
              Your signed-in account is your courier identity.
            </p>
            {isSignedIn ? (
              <p className="mt-2 text-sm text-ink">
                You&apos;re on the job as{" "}
                <span className="font-medium">{displayName ?? "a participant"}</span>
                {myParty && (
                  <>
                    {" "}— your role is{" "}
                    <span className="font-medium">{myParty.role}</span>.
                  </>
                )}
              </p>
            ) : (
              <div className="mt-3">
                <SignInPrompt>
                  Sign in with a customer or seller account to make offers and
                  coordinate deliveries.
                </SignInPrompt>
              </div>
            )}
          </Section>

          {(job.status === "open" || job.status === "negotiating") && (
            <Section title="Make an offer">
              {isSignedIn ? (
                <>
                  <input
                    type="number"
                    min="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Your price (₦)"
                    className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={offer}
                    className="mt-2 w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
                  >
                    {isPending ? "Sending…" : "Send offer"}
                  </button>
                  <p className="mt-2 text-xs text-ink-muted">
                    A verified ID on your How&apos;s u account unlocks courier offers.
                  </p>
                </>
              ) : (
                <SignInPrompt>Sign in to make an offer.</SignInPrompt>
              )}
            </Section>
          )}

          {job.status === "accepted" && (
            <Section title="Pickup">
              {isSignedIn ? (
                <>
                  <p className="text-xs text-ink-muted">
                    The accepted courier marks the package picked up here.
                  </p>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={pickup}
                    className="mt-3 w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
                  >
                    {isPending ? "Updating…" : "Mark picked up"}
                  </button>
                </>
              ) : (
                <SignInPrompt>Sign in to mark pickup.</SignInPrompt>
              )}
            </Section>
          )}

          {(job.status === "accepted" || job.status === "in_transit") && (
            <Section title="Verification codes">
              <p className="text-xs text-ink-muted">
                The courier generates a code and shows it to the sender/recipient,
                who enters it here to confirm pickup or delivery.
              </p>
              {isSignedIn ? (
                <>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => genCode("pickup")}
                      className="flex-1 rounded-medium border border-ink-strong px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
                    >
                      Pickup code
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => genCode("delivery")}
                      className="flex-1 rounded-medium border border-ink-strong px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
                    >
                      Delivery code
                    </button>
                  </div>
                  {generatedCode && (
                    <p className="mt-2 rounded-medium bg-emerald-50 p-2 text-center font-mono text-sm text-emerald-700">
                      {generatedCode}
                    </p>
                  )}
                  <select
                    value={codePurpose}
                    onChange={(e) => setCodePurpose(e.target.value as "pickup" | "delivery")}
                    className="mt-3 w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  >
                    <option value="pickup">Verify pickup</option>
                    <option value="delivery">Verify delivery</option>
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="6-digit code"
                    className="mt-2 w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={verify}
                    className="mt-2 w-full rounded-medium border border-ink-strong px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
                  >
                    {isPending ? "Verifying…" : "Verify code"}
                  </button>
                </>
              ) : (
                <SignInPrompt>Sign in to generate or verify codes.</SignInPrompt>
              )}
            </Section>
          )}

          {(job.status === "accepted" || job.status === "in_transit") && (
            <Section title="Confirm delivery">
              <p className="text-xs text-ink-muted">
                The recipient confirms the drop-off to release the courier&apos;s payment.
              </p>
              {isSignedIn ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={confirm}
                  className="mt-3 w-full rounded-medium bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isPending ? "Confirming…" : "Confirm delivered"}
                </button>
              ) : (
                <SignInPrompt>Sign in to confirm delivery.</SignInPrompt>
              )}
            </Section>
          )}

          {["open", "negotiating", "accepted", "in_transit"].includes(job.status) && (
            <Section title="Cancel job">
              {isSignedIn ? (
                <>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason"
                    className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={cancel}
                    className="mt-2 w-full rounded-medium border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-600 hover:text-white disabled:opacity-50"
                  >
                    {isPending ? "Cancelling…" : "Cancel job"}
                  </button>
                </>
              ) : (
                <SignInPrompt>Sign in to cancel this job.</SignInPrompt>
              )}
            </Section>
          )}

          {message && <p className="text-sm text-ink-muted">{message}</p>}
        </div>
      </div>
    </div>
  )
}

export default DeliverJobDetailClient
