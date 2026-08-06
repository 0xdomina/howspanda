"use client"

import { useState, useTransition } from "react"
import {
  addSellerTeamMember,
  listSellerTeam,
  removeSellerTeamMember,
  type SellerTeamMember,
} from "@lib/data/seller"

const memberName = (m: SellerTeamMember) =>
  [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || m.phone || "—"

const AddMemberForm = ({ onDone }: { onDone: () => void }) => {
  const [first_name, setFirstName] = useState("")
  const [last_name, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setMessage(null)
    const cleanEmail = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      setMessage({ ok: false, text: "Enter a valid email address." })
      return
    }
    startTransition(async () => {
      const res = await addSellerTeamMember({
        email: cleanEmail,
        first_name: first_name.trim() || undefined,
        last_name: last_name.trim() || undefined,
      })
      if (res.success) {
        setMessage({ ok: true, text: `${cleanEmail} can now sign in and manage the store.` })
        setFirstName("")
        setLastName("")
        setEmail("")
        onDone()
      } else {
        setMessage({ ok: false, text: res.error ?? "Could not add team member." })
      }
    })
  }

  return (
    <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
      <h3 className="font-display text-lg font-medium text-ink">Invite a staff member</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Invite an existing platform user by email. They keep their own login and
        sign in with it once they accept — no new password is created. They get
        the full store dashboard (products, orders, delivery, broadcasts) but
        cannot change settings, manage the team, or touch money.
      </p>
      <div className="mt-3 grid grid-cols-1 small:grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">First name</label>
          <input
            value={first_name}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Ada"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Last name</label>
          <input
            value={last_name}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Okafor"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@yourshop.com"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <p className="text-xs text-ink-muted small:col-span-2">
          The person must already have an account on the platform to be invited.
          They will use their existing password to sign in.
        </p>
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>
          {message.text}
        </p>
      )}

      <button
        type="button"
        disabled={isPending}
        onClick={submit}
        className="mt-3 w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Inviting…" : "Invite staff member"}
      </button>
    </div>
  )
}

const SellerTeamClient = ({
  team: initial,
  isOwner,
  currentAdminId,
}: {
  team: SellerTeamMember[]
  isOwner: boolean
  currentAdminId: string
}) => {
  const [team, setTeam] = useState(initial)
  const [removing, setRemoving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const reload = async () => {
    const next = await listSellerTeam()
    if (next.length) setTeam(next)
  }

  const remove = (member: SellerTeamMember) => {
    setMessage(null)
    if (
      !window.confirm(
        `Remove ${memberName(member)}? Their login is revoked immediately and they lose access to the store.`
      )
    ) {
      return
    }
    setRemoving(member.id)
    startTransition(async () => {
      const res = await removeSellerTeamMember(member.id)
      setRemoving(null)
      if (res.success) {
        setMessage({ ok: true, text: `${memberName(member)} removed.` })
        await reload()
      } else {
        setMessage({ ok: false, text: res.error ?? "Could not remove team member." })
      }
    })
  }

  const owner = team.find((m) => m.role === "owner")

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Team
      </h2>
      <p className="text-sm text-ink-muted">
        Everyone who can sign in and run this store. Staff members work the
        day-to-day; only the owner can edit settings, manage the team or withdraw
        money.
      </p>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">People</h3>
        <ul className="mt-2 divide-y divide-ink-hairline">
          {team.map((member) => {
            const me = member.id === currentAdminId
            return (
              <li key={member.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {memberName(member)}
                    {me && <span className="ml-2 text-xs text-ink-muted">(you)</span>}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {member.role === "owner" ? "Owner" : "Staff"}
                    {member.email ? ` · ${member.email}` : ""}
                    {member.created_at
                      ? ` · since ${new Date(member.created_at).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                {isOwner && member.role === "staff" && (
                  <button
                    type="button"
                    disabled={isPending && removing === member.id}
                    onClick={() => remove(member)}
                    className="shrink-0 rounded-medium border border-ink-hairline px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {removing === member.id ? "Removing…" : "Remove"}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-ink-muted">
          {owner
            ? `${owner.first_name || "The owner"} is the only owner of this store.`
            : ""}
        </p>
      </div>

      {isOwner && (
        <div className="space-y-3">
          <AddMemberForm onDone={() => void reload()} />
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

export default SellerTeamClient
