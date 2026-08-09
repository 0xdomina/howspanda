"use client"

import { useState, useTransition } from "react"
import {
  addSellerTeamMember,
  listSellerTeam,
  removeSellerTeamMember,
  updateSellerTeamMemberPermissions,
  type SellerTeamMember,
} from "@lib/data/seller"
import {
  DEFAULT_STAFF_PERMISSIONS,
  SELLER_PERMISSION_KEYS,
  SELLER_PERMISSION_LABELS,
  type SellerPermission,
} from "@lib/seller-permissions"

const memberName = (m: SellerTeamMember) =>
  [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || m.phone || "—"

const AddMemberForm = ({ onDone }: { onDone: () => void }) => {
  const [first_name, setFirstName] = useState("")
  const [last_name, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [permissions, setPermissions] = useState<SellerPermission[]>([
    ...DEFAULT_STAFF_PERMISSIONS,
  ])
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
        permissions,
      })
      if (res.success) {
        setMessage({ ok: true, text: `${cleanEmail} is now on the team and will get an invite email.` })
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
        access is limited to the areas you select below. Store settings, team
        management, money and redeemable creation stay owner-only.
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

      <fieldset className="mt-4 rounded-medium border border-ink-hairline bg-white p-3">
        <legend className="px-1 text-xs font-semibold text-ink">Access for this manager</legend>
        <p className="mb-2 text-xs text-ink-muted">
          Choose the business areas they can use. Store settings, team management,
          money and redeemable creation stay owner-only.
        </p>
        <div className="grid grid-cols-1 gap-2 small:grid-cols-2">
          {SELLER_PERMISSION_KEYS.map((permission) => (
            <label key={permission} className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={permissions.includes(permission)}
                onChange={() =>
                  setPermissions((current) =>
                    current.includes(permission)
                      ? current.filter((item) => item !== permission)
                      : [...current, permission]
                  )
                }
                className="mt-0.5 accent-ink"
              />
              <span>{SELLER_PERMISSION_LABELS[permission]}</span>
            </label>
          ))}
        </div>
      </fieldset>

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

const PermissionEditor = ({
  member,
  disabled,
  onSave,
}: {
  member: SellerTeamMember
  disabled: boolean
  onSave: (member: SellerTeamMember, permissions: SellerPermission[]) => void
}) => {
  const [permissions, setPermissions] = useState<SellerPermission[]>(
    member.permissions ?? DEFAULT_STAFF_PERMISSIONS
  )

  return (
    <details className="text-right">
      <summary className="cursor-pointer text-xs font-medium text-ink underline underline-offset-4">
        Edit access
      </summary>
      <div className="mt-2 w-64 rounded-medium border border-ink-hairline bg-white p-3 text-left shadow-sm">
        <p className="mb-2 text-xs text-ink-muted">
          Redeemable creation, settings, team and money remain owner-only.
        </p>
        <div className="space-y-2">
          {SELLER_PERMISSION_KEYS.map((permission) => (
            <label key={permission} className="flex items-start gap-2 text-xs text-ink">
              <input
                type="checkbox"
                checked={permissions.includes(permission)}
                onChange={() =>
                  setPermissions((current) =>
                    current.includes(permission)
                      ? current.filter((item) => item !== permission)
                      : [...current, permission]
                  )
                }
                className="mt-0.5 accent-ink"
              />
              <span>{SELLER_PERMISSION_LABELS[permission]}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSave(member, permissions)}
          className="mt-3 w-full rounded-medium bg-ink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {disabled ? "Saving…" : "Save access"}
        </button>
      </div>
    </details>
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
  const [savingPermissions, setSavingPermissions] = useState<string | null>(null)

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
  const staffCount = team.filter((m) => m.role === "staff").length

  const savePermissions = (
    member: SellerTeamMember,
    permissions: SellerPermission[]
  ) => {
    setMessage(null)
    setSavingPermissions(member.id)
    startTransition(async () => {
      const res = await updateSellerTeamMemberPermissions(member.id, permissions)
      setSavingPermissions(null)
      if (res.success) {
        setMessage({ ok: true, text: `${memberName(member)}'s access was updated.` })
        await reload()
      } else {
        setMessage({ ok: false, text: res.error ?? "Could not update access." })
      }
    })
  }

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
                  {member.role === "staff" && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(member.permissions ?? DEFAULT_STAFF_PERMISSIONS).map((permission) => (
                        <span key={permission} className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink-muted">
                          {SELLER_PERMISSION_LABELS[permission]}
                        </span>
                      ))}
                    </div>
                  )}
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
                {isOwner && member.role === "staff" && (
                  <PermissionEditor
                    member={member}
                    disabled={savingPermissions === member.id || isPending}
                    onSave={savePermissions}
                  />
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
          {staffCount >= 3 ? (
            <div className="rounded-large border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              This store has reached its limit of 3 invited managers. Remove one
              before inviting another.
            </div>
          ) : (
            <AddMemberForm onDone={() => void reload()} />
          )}
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
