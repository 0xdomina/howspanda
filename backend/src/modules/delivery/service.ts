import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import { createHash, randomInt } from "node:crypto"
import { geocodeAddress, haversineKm } from "../../lib/geo/geocode"
import DeliveryJob from "./models/delivery-job"
import DeliveryOffer from "./models/delivery-offer"
import DeliveryParty from "./models/delivery-party"
import DeliveryMessage from "./models/delivery-message"
import DeliveryVerification from "./models/delivery-verification"
import DeliveryCourier from "./models/delivery-courier"

const round2 = (n: number) => Math.round(n * 100) / 100

// Public job views must never leak the recipient's phone number.
function stripDestinationPhone(job: Record<string, unknown>) {
  const { destination_phone, ...rest } = job
  return rest
}

// In-app verification codes are 6 digits, valid for 15 minutes.
const CODE_LIFETIME_MS = 15 * 60 * 1000

type PartyRole = "sender" | "courier" | "recipient"
type JobStatus = "open" | "negotiating" | "accepted" | "in_transit" | "delivered" | "cancelled"

export type PostJobInput = {
  orderId?: string
  sellerId?: string
  packageDescription: string
  packageWeight?: string
  pickupAddress: string
  destinationAddress: string
  destinationPhone?: string
  postedPrice: number
}

export type MakeOfferInput = {
  jobId: string
  courierEmail: string
  offeredPrice: number
}

export type SendMessageInput = {
  jobId: string
  senderEmail: string
  body: string
}

class DeliveryModuleService extends MedusaService({
  DeliveryJob,
  DeliveryOffer,
  DeliveryParty,
  DeliveryMessage,
  DeliveryVerification,
  DeliveryCourier,
}) {
  /**
   * Post a delivery job (sender: the store owner). Always registers the sender
   * party; the recipient party is registered on first lookup of the job with a
   * recipient email (or upfront if provided by the caller later).
   */
  async postJob(input: PostJobInput) {
    if (!input.packageDescription || !input.pickupAddress || !input.destinationAddress) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "packageDescription, pickupAddress, and destinationAddress are required"
      )
    }
    if (!(Number.isFinite(input.postedPrice) && input.postedPrice > 0)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "postedPrice must be a positive number"
      )
    }
    // Location accuracy: both endpoints must resolve to real coordinates or the
    // job is rejected — a courier can never be routed to an unlocatable address.
    const pickup = await geocodeAddress(input.pickupAddress)
    const destination = await geocodeAddress(input.destinationAddress)
    if (!pickup) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Could not locate pickup address: "${input.pickupAddress}". Please use a more specific address.`
      )
    }
    if (!destination) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Could not locate destination address: "${input.destinationAddress}". Please use a more specific address.`
      )
    }
    const job = await this.createDeliveryJobs({
      order_id: input.orderId ?? null,
      seller_id: input.sellerId ?? null,
      package_description: input.packageDescription,
      package_weight: input.packageWeight ?? null,
      pickup_address: input.pickupAddress,
      destination_address: input.destinationAddress,
      destination_phone: input.destinationPhone ?? null,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      destination_lat: destination.lat,
      destination_lng: destination.lng,
      posted_price: round2(input.postedPrice),
      status: "open",
    })
    return job
  }

  /** Register (idempotently) a party on a job. */
  async ensureParty(jobId: string, role: PartyRole, email: string, sellerId?: string) {
    const emailNorm = email.trim().toLowerCase()
    const existing = await this.listDeliveryParties({
      job_id: jobId,
      role,
      email: emailNorm,
    })
    if (existing.length > 0) {
      return existing[0]
    }
    return await this.createDeliveryParties({
      job_id: jobId,
      role,
      email: emailNorm,
      seller_id: sellerId ?? null
    })
  }

  /**
   * Anyone can browse open jobs. Optional `city` filter (substring match on
   * either address) and/or `lat`/`lng`/`radiusKm` (near-me: only jobs whose
   * pickup point falls within `radiusKm` of the given point, straight-line).
   * When a reference point is supplied each job is annotated with
   * `pickup_distance_km` and `destination_distance_km`.
   */
  async listOpenJobs(
    filters: {
      city?: string
      lat?: number
      lng?: number
      radiusKm?: number
    } = {}
  ) {
    const jobs = await this.listDeliveryJobs(
      { status: ["open", "negotiating"] as JobStatus[] },
      { order: { created_at: "DESC" }, take: 100 }
    )
    let filtered = jobs
    if (filters.city) {
      const needle = filters.city.toLowerCase()
      filtered = filtered.filter(
        (j) =>
          j.pickup_address.toLowerCase().includes(needle) ||
          j.destination_address.toLowerCase().includes(needle)
      )
    }
    const hasPoint =
      Number.isFinite(filters.lat) &&
      Number.isFinite(filters.lng)
    if (hasPoint) {
      const point = { lat: filters.lat as number, lng: filters.lng as number }
      const radius = Number.isFinite(filters.radiusKm)
        ? (filters.radiusKm as number)
        : 25 // default: within 25 km
      filtered = filtered.filter((j) => {
        if (!Number.isFinite(j.pickup_lat) || !Number.isFinite(j.pickup_lng)) {
          return false
        }
        return haversineKm(point, {
          lat: j.pickup_lat as number,
          lng: j.pickup_lng as number,
        }) <= radius
      })
    }
    if (hasPoint) {
      const point = { lat: filters.lat as number, lng: filters.lng as number }
      filtered = (filtered as any[]).map((j) => {
        const d = {
          pickup: Number.isFinite(j.pickup_lat) && Number.isFinite(j.pickup_lng)
            ? haversineKm(point, { lat: j.pickup_lat as number, lng: j.pickup_lng as number })
            : null,
          destination: Number.isFinite(j.destination_lat) && Number.isFinite(j.destination_lng)
            ? haversineKm(point, { lat: j.destination_lat as number, lng: j.destination_lng as number })
            : null,
        }
        return { ...j, pickup_distance_km: d.pickup, destination_distance_km: d.destination }
      })
    }
    // Public courier browse must not leak the recipient's phone number.
    return (filtered as any[]).map((j) => {
      const { destination_phone, ...job } = j
      return job
    })
  }

  /** A store owner's own delivery jobs (seller view), newest first. */
  async listJobsForSeller(sellerId: string) {
    return await this.listDeliveryJobs(
      { seller_id: sellerId },
      { order: { created_at: "DESC" }, take: 100, relations: ["offers", "parties"] }
    )
  }

  async getJob(jobId: string) {
    const jobs = await this.listDeliveryJobs(
      { id: jobId },
      { take: 1, relations: ["offers", "parties", "messages", "verifications"] }
    )
    if (!jobs.length) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Delivery job not found")
    }
    return jobs[0]
  }

  /**
   * Courier role (Phase: courier is a real role). Applications come from a
   * logged-in customer or seller account; the route layer enforces phone KYC
   * before the profile is approved, so "approved" always means "a real account
   * holder who proved a phone number". Offers and pickups then derive the
   * courier's email from the authenticated actor — never from the body.
   */
  async getCourierProfile(courierEmail: string) {
    const email = courierEmail.trim().toLowerCase()
    const [profile] = await this.listDeliveryCouriers(
      { courier_email: email },
      { take: 1 }
    )
    return profile ?? null
  }

  async applyCourier(input: {
    courierEmail: string
    authIdentityId?: string | null
    actorType?: "customer" | "seller" | null
    name?: string | null
    phone?: string | null
    city?: string | null
    vehicle?: string | null
  }) {
    const email = input.courierEmail.trim().toLowerCase()
    const existing = await this.getCourierProfile(email)

    // Re-applying updates the courier's details and re-activates a suspended
    // profile (KYC is re-checked by the route each time).
    if (existing) {
      return await this.updateDeliveryCouriers({
        id: existing.id,
        name: input.name ?? existing.name,
        phone: input.phone ?? existing.phone,
        city: input.city ?? existing.city,
        vehicle: input.vehicle ?? existing.vehicle,
        auth_identity_id: input.authIdentityId ?? existing.auth_identity_id,
        actor_type: input.actorType ?? existing.actor_type,
        status: "approved",
        approved_at: new Date(),
      })
    }

    return await this.createDeliveryCouriers({
      courier_email: email,
      name: input.name ?? null,
      phone: input.phone ?? null,
      city: input.city ?? null,
      vehicle: input.vehicle ?? null,
      auth_identity_id: input.authIdentityId ?? null,
      actor_type: input.actorType ?? null,
      status: "approved",
      approved_at: new Date(),
    })
  }

  /**
   * Gate check for courier actions (offers, pickup). Throws when the email is
   * not an approved courier. Phone KYC is asserted separately by the KYC
   * module at the route layer.
   */
  async assertCourierCanOffer(courierEmail: string): Promise<void> {
    const profile = await this.getCourierProfile(courierEmail)
    if (!profile) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Apply to be a courier before making delivery offers",
        "courier_required"
      )
    }
    if (profile.status !== "approved") {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Your courier application is not approved yet",
        "courier_not_approved"
      )
    }
  }

  /**
   * A courier's own activity feed for the dashboard: every offer they made
   * (with the job) plus the jobs they accepted — newest first.
   */
  async listCourierJobs(courierEmail: string) {
    const email = courierEmail.trim().toLowerCase()
    const offers = await this.listDeliveryOffers(
      { courier_email: email },
      { order: { created_at: "DESC" }, take: 100, relations: ["job"] }
    )
    return offers.map((offer) => {
      const job = (offer as any).job
      const stripped = job ? stripDestinationPhone(job) : null
      return {
        offer_id: offer.id,
        offered_price: offer.offered_price,
        offer_status: offer.status,
        created_at: offer.created_at,
        job: stripped,
      }
    })
  }

  /**
   * A courier makes an offer (or accepts the posted price by offering exactly
   * the posted price). Counter-offers are new rows — immutable history.
   */
  async makeOffer(input: MakeOfferInput) {
    const job = await this.getJob(input.jobId)
    if (!["open", "negotiating"].includes(job.status)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Job is not accepting offers"
      )
    }
    if (!(Number.isFinite(input.offeredPrice) && input.offeredPrice > 0)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "offeredPrice must be a positive number"
      )
    }
    const offer = await this.createDeliveryOffers({
      job_id: job.id,
      courier_email: input.courierEmail.trim().toLowerCase(),
      offered_price: round2(input.offeredPrice),
      status: "pending"
    })
    await this.ensureParty(job.id, "courier", input.courierEmail)
    // A price lower/higher than posted starts negotiation; keep the status
    // negotiating once there is more than one offer.
    const offerCount = await this.listDeliveryOffers({ job_id: job.id })
    if (offerCount.length > 1 && job.status === "open") {
      await this.updateDeliveryJobs({ id: job.id, status: "negotiating" })
    }
    return offer
  }

  /**
   * Sender accepts an offer — the price is locked and the job becomes
   * `accepted`. This is where the 3-way DM effectively "opens": sender,
   * courier, and recipient parties are all present.
   */
  async acceptOffer(jobId: string, offerId: string, senderEmail: string) {
    const job = await this.getJob(jobId)
    if (!["open", "negotiating"].includes(job.status)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Job is not open for acceptance"
      )
    }
    const senderParty = await this.listDeliveryParties({
      job_id: jobId,
      role: "sender",
      email: senderEmail,
    })
    if (job.seller_id) {
      // Sender-party check uses the seller id when the job is seller-posted.
      const senderSeller = await this.listDeliveryParties({
        job_id: jobId,
        role: "sender",
        seller_id: job.seller_id,
      })
      if (!senderSeller.length && !senderParty.length) {
        throw new MedusaError(
          MedusaError.Types.UNAUTHORIZED,
          "Only the sender can accept an offer"
        )
      }
    } else if (!senderParty.length) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Only the sender can accept an offer"
      )
    }

    const offers = await this.listDeliveryOffers({ id: offerId })
    const offer = offers[0]
    if (!offer || offer.status !== "pending") {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Offer not pending")
    }
    if (offer.job_id !== jobId) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Offer does not belong to this job")
    }

    // Reject all other pending offers, accept this one.
    const otherOffers = await this.listDeliveryOffers({
      job_id: jobId,
      status: "pending",
    })
    const otherIds = otherOffers
      .filter((o) => o.id !== offerId)
      .map((o) => o.id)
    if (otherIds.length) {
      await this.updateDeliveryOffers(
        otherIds.map((id) => ({ id, status: "rejected" as const }))
      )
    }
    await this.updateDeliveryOffers({ id: offerId, status: "accepted" })
    await this.ensureParty(jobId, "courier", offer.courier_email)

    const updated = await this.updateDeliveryJobs({
      id: jobId,
      status: "accepted",
      accepted_offer_id: offerId,
    })

    await this.sendMessage({
      jobId,
      senderEmail: senderEmail || offer.courier_email,
      body: `Offer accepted at ₦${Number(offer.offered_price).toLocaleString()} — job locked.`,
      isSystem: true,
    })

    return updated
  }

  /** Courier marks the package picked up. */
  async markPickedUp(jobId: string, courierEmail: string) {
    const job = await this.getJob(jobId)
    if (job.status !== "accepted") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Job must be accepted before pickup"
      )
    }
    // M3: only the ACCEPTED courier may mark pickup — any courier was previously
    // a party (they made an offer) so a rejected courier could flip the job to
    // in_transit.
    const acceptedOffer = await this.listDeliveryOffers({
      id: job.accepted_offer_id,
    })
    const acceptedCourier = acceptedOffer[0]?.courier_email
    if (
      !acceptedCourier ||
      acceptedCourier.trim().toLowerCase() !==
        courierEmail.trim().toLowerCase()
    ) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Only the accepted courier can mark pickup"
      )
    }
    const updated = await this.updateDeliveryJobs({
      id: jobId,
      status: "in_transit",
      picked_up_at: new Date(),
    })
    await this.sendMessage({
      jobId,
      senderEmail: courierEmail,
      body: "Package picked up — in transit.",
      isSystem: true,
    })
    return updated
  }

  /**
   * Recipient confirms delivery → the agreed price is released to the courier
   * wallet (the caller's wallet service credits `delivery_payout`). Returns the
   * amount released so the route can credit it.
   *
   * Hardening: the confirming caller MUST already be a party (recipient or
   * courier) on the job. Previously any caller could supply any email and
   * release the payout (money-loss vector) — that escape hatch is removed.
   */
  async confirmDelivery(jobId: string, recipientEmail: string, courierEmail?: string) {
    const job = await this.getJob(jobId)
    if (!["in_transit", "accepted"].includes(job.status)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Job is not deliverable"
      )
    }
    // The caller must already be on the job roster — never register them on
    // the spot (that allowed payout release by anyone).
    const parties = await this.listDeliveryParties({ job_id: jobId })
    const confirmEmail = (recipientEmail || courierEmail || "").trim().toLowerCase()
    const isParty =
      parties.some((p) => p.email === confirmEmail) &&
      confirmEmail !== ""
    if (!isParty) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Only a job party can confirm delivery"
      )
    }

    const offers = await this.listDeliveryOffers({ id: job.accepted_offer_id })
    const accepted = offers[0]
    const payout = accepted
      ? Number(accepted.offered_price)
      : Number(job.posted_price)

    const updated = await this.updateDeliveryJobs({
      id: jobId,
      status: "delivered",
      delivered_at: new Date(),
    })
    await this.sendMessage({
      jobId,
      senderEmail: confirmEmail,
      body: "Delivery confirmed — payment released to the courier.",
      isSystem: true,
    })
    return { job: updated, payout, courierEmail: accepted?.courier_email ?? null }
  }

  /**
   * Cancel a job. Pre-pickup cancels immediately; post-pickup requires sender
   * approval (the job stays in_transit with a flag until the sender approves).
   */
  async cancelJob(jobId: string, reason: string, byEmail: string) {
    const job = await this.getJob(jobId)
    if (["delivered", "cancelled"].includes(job.status)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Job is already terminal"
      )
    }
    // M2: only a party on the job roster may cancel (previously any caller
    // could kill a rival's accepted job — griefing / suppressing payouts).
    const party = await this.listDeliveryParties({
      job_id: jobId,
      email: byEmail,
    })
    if (!party.length) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Only a job party can cancel this job"
      )
    }
    const senderParty = party.filter((p) => p.role === "sender")

    const isSender = senderParty.length > 0

    if (job.status === "in_transit" && !isSender) {
      // Courier wants to abandon a picked-up job — flag for sender approval.
      const updated = await this.updateDeliveryJobs({
        id: jobId,
        cancel_requires_sender_approval: true,
        cancel_reason: reason,
      })
      await this.sendMessage({
        jobId,
        senderEmail: byEmail,
        body: `Cancellation requested: ${reason} — awaiting sender approval.`,
        isSystem: true,
      })
      return { job: updated, requiresSenderApproval: true }
    }

    const updated = await this.updateDeliveryJobs({
      id: jobId,
      status: "cancelled",
      cancelled_at: new Date(),
      cancel_reason: reason,
    })
    await this.sendMessage({
      jobId,
      senderEmail: byEmail,
      body: `Job cancelled: ${reason}`,
      isSystem: true,
    })
    return { job: updated, requiresSenderApproval: false }
  }

  /** Sender approves a requested post-pickup cancellation. */
  async approveCancellation(jobId: string, byEmail: string) {
    const job = await this.getJob(jobId)
    const senderParty = await this.listDeliveryParties({
      job_id: jobId,
      role: "sender",
      email: byEmail,
    })
    if (!senderParty.length) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Only the sender can approve cancellation")
    }
    const updated = await this.updateDeliveryJobs({
      id: jobId,
      status: "cancelled",
      cancelled_at: new Date(),
      cancel_requires_sender_approval: false,
    })
    await this.sendMessage({
      jobId,
      senderEmail: byEmail,
      body: "Sender approved cancellation.",
      isSystem: true,
    })
    return updated
  }

  // ---- Chat (Phase 12) -----------------------------------------------------

  /** A user is a party of a job if their email is on the roster. */
  private async assertParty(jobId: string, email: string) {
    const emailNorm = email.trim().toLowerCase()
    const parties = await this.listDeliveryParties({ job_id: jobId })
    if (!parties.some((p) => p.email === emailNorm)) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Only a job party can perform this action"
      )
    }
  }

  /** Only the accepted courier can generate verification codes. */
  private async assertCourier(jobId: string, email: string) {
    const couriers = await this.listDeliveryParties({
      job_id: jobId,
      role: "courier",
      email: email.trim().toLowerCase(),
    })
    if (!couriers.length) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Only the courier can generate verification codes"
      )
    }
  }

  async sendMessage(input: SendMessageInput & { isSystem?: boolean }) {
    if (!input.body?.trim()) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Message body is required")
    }
    const job = await this.getJob(input.jobId)
    if (["open", "negotiating"].includes(job.status)) {
      // Chat opens on acceptance; still allow reads for parties but reject
      // writes until the job is locked.
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Chat opens once the job is accepted"
      )
    }
    if (!input.isSystem) {
      await this.assertParty(input.jobId, input.senderEmail)
    }
    const message = await this.createDeliveryMessages({
      job_id: input.jobId,
      sender_email: input.senderEmail.trim().toLowerCase(),
      body: input.body.trim(),
      is_system: input.isSystem ?? false
    })
    return message
  }

  async listMessages(jobId: string, byEmail?: string) {
    if (byEmail) {
      await this.assertParty(jobId, byEmail)
    }
    return await this.listDeliveryMessages(
      { job_id: jobId },
      { order: { created_at: "ASC" } }
    )
  }

  // ---- Verification codes (Phase 12) --------------------------------------

  async generateVerification(jobId: string, purpose: "pickup" | "delivery", byEmail: string) {
    const job = await this.getJob(jobId)
    if (["open", "negotiating", "cancelled"].includes(job.status)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Job is not active")
    }
    if (purpose === "pickup" && job.status !== "accepted") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Pickup code requires an accepted job"
      )
    }
    if (purpose === "delivery" && !["in_transit", "accepted"].includes(job.status)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Delivery code requires the job to be picked up or accepted"
      )
    }
    await this.assertCourier(jobId, byEmail)
    const code = String(randomInt(0, 1000000)).padStart(6, "0")
    const codeHash = createHash("sha256").update(code).digest("hex")
    await this.createDeliveryVerifications({
      job_id: jobId,
      purpose,
      code_hash: codeHash,
      code_tail: code.slice(-4),
      status: "active",
      generated_by_email: byEmail.trim().toLowerCase(),
      expires_at: new Date(Date.now() + CODE_LIFETIME_MS),
    })
    // The raw code is returned ONCE to the generator (shown in-app); only the
    // hash is stored.
    return { code, expiresInMs: CODE_LIFETIME_MS }
  }

  async verify(
    jobId: string,
    code: string,
    purpose: "pickup" | "delivery",
    byEmail: string
  ): Promise<{
    valid: boolean
    purpose: "pickup" | "delivery"
    job?: Awaited<ReturnType<DeliveryModuleService["getJob"]>>
    payout?: number
    courierEmail?: string | null
  }> {
    const now = new Date()
    const byEmailNorm = byEmail.trim().toLowerCase()
    const active = await this.listDeliveryVerifications({
      job_id: jobId,
      purpose,
      status: "active",
    })
    const candidate = active.find(
      (v) =>
        createHash("sha256").update(code).digest("hex") === v.code_hash
    )
    if (!candidate) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid verification code")
    }
    if (candidate.generated_by_email === byEmailNorm) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "The code generator cannot verify their own code"
      )
    }
    if (candidate.expires_at < now) {
      await this.updateDeliveryVerifications({ id: candidate.id, status: "expired" })
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Verification code expired")
    }
    await this.updateDeliveryVerifications({
      id: candidate.id,
      status: "used",
      used_at: now,
    })
    // Presenting a valid code is proof of involvement — register the verifier
    // as the matching party (sender confirms pickup, recipient confirms delivery).
    const parties = await this.listDeliveryParties({ job_id: jobId })
    if (!parties.some((p) => p.email === byEmailNorm)) {
      await this.ensureParty(
        jobId,
        purpose === "pickup" ? "sender" : "recipient",
        byEmailNorm
      )
    }
    if (purpose === "pickup") {
      // The sender confirms pickup with the code the courier showed them; the
      // job moves in_transit without requiring the verifier to be the courier.
      const updated = await this.updateDeliveryJobs({
        id: jobId,
        status: "in_transit",
        picked_up_at: now,
      })
      await this.sendMessage({
        jobId,
        senderEmail: byEmailNorm,
        body: "Pickup verified with the in-app code — in transit.",
        isSystem: true,
      })
      return { valid: true, purpose, job: updated }
    }
    // purpose === "delivery" → recipient confirms with the courier's code;
    // this releases the agreed price to the courier wallet.
    const result = await this.confirmDelivery(jobId, byEmailNorm)
    return { valid: true, purpose, ...result }
  }
}

export default DeliveryModuleService
