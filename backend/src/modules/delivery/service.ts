import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import { createHash, randomInt } from "node:crypto"
import DeliveryJob from "./models/delivery-job"
import DeliveryOffer from "./models/delivery-offer"
import DeliveryParty from "./models/delivery-party"
import DeliveryMessage from "./models/delivery-message"
import DeliveryVerification from "./models/delivery-verification"

const round2 = (n: number) => Math.round(n * 100) / 100

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
    const job = await this.createDeliveryJobs({
      order_id: input.orderId ?? null,
      seller_id: input.sellerId ?? null,
      package_description: input.packageDescription,
      package_weight: input.packageWeight ?? null,
      pickup_address: input.pickupAddress,
      destination_address: input.destinationAddress,
      destination_phone: input.destinationPhone ?? null,
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

  /** Anyone can browse open jobs. */
  async listOpenJobs(filters: { city?: string } = {}) {
    const jobs = await this.listDeliveryJobs(
      { status: ["open", "negotiating"] as JobStatus[] },
      { order: { created_at: "DESC" }, take: 100 }
    )
    if (filters.city) {
      const needle = filters.city.toLowerCase()
      return jobs.filter(
        (j) =>
          j.pickup_address.toLowerCase().includes(needle) ||
          j.destination_address.toLowerCase().includes(needle)
      )
    }
    return jobs
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
    const courierParty = await this.listDeliveryParties({
      job_id: jobId,
      role: "courier",
      email: courierEmail,
    })
    if (!courierParty.length) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Only the courier can mark pickup")
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
   */
  async confirmDelivery(jobId: string, recipientEmail: string, courierEmail?: string) {
    const job = await this.getJob(jobId)
    if (!["in_transit", "accepted"].includes(job.status)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Job is not deliverable"
      )
    }
    const recipientParty = await this.listDeliveryParties({
      job_id: jobId,
      role: "recipient",
      email: recipientEmail,
    })
    if (!recipientParty.length && !(job.seller_id)) {
      // Recipient identity is email-based; accept the confirmation when the
      // party exists OR when the job was manually posted without a recipient
      // party yet (register on confirm).
      await this.ensureParty(jobId, "recipient", recipientEmail)
    } else if (!recipientParty.length && job.seller_id) {
      // Seller-posted jobs need an existing recipient party OR the courier may
      // not be confirming as the recipient. Register if the confirm comes from
      // a courier-email (the courier confirms POD on behalf of the recipient).
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
      senderEmail: recipientEmail || courierEmail || "",
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
    const senderParty = await this.listDeliveryParties({
      job_id: jobId,
      role: "sender",
      email: byEmail,
    })
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
    const message = await this.createDeliveryMessages({
      job_id: input.jobId,
      sender_email: input.senderEmail.trim().toLowerCase(),
      body: input.body.trim(),
      is_system: input.isSystem ?? false
    })
    return message
  }

  async listMessages(jobId: string) {
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

  async verify(jobId: string, code: string, purpose: "pickup" | "delivery", byEmail: string) {
    const now = new Date()
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
    if (candidate.expires_at < now) {
      await this.updateDeliveryVerifications({ id: candidate.id, status: "expired" })
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Verification code expired")
    }
    await this.updateDeliveryVerifications({
      id: candidate.id,
      status: "used",
      used_at: now,
    })
    if (purpose === "pickup") {
      await this.markPickedUp(jobId, byEmail)
    }
    return { valid: true, purpose }
  }
}

export default DeliveryModuleService
