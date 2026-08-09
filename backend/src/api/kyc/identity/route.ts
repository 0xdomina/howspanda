import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import multer from "multer"
import { z } from "@medusajs/framework/zod"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"
import { PostKycIdentitySchema } from "../../middlewares"
import { syncSellerVerificationStatus } from "../../../lib/sellers/verification-status"
import { resolveSellerContext } from "../../../lib/sellers/resolve-seller"
import {
  KYC_DOCUMENT_MAX_BYTES,
  validateKycDocument,
} from "../../../lib/kyc/validate-document"

type Body = z.infer<typeof PostKycIdentitySchema>

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: KYC_DOCUMENT_MAX_BYTES, files: 1 },
}).single("document")

const parseMultipart = (req: unknown, res: unknown) =>
  new Promise<void>((resolve, reject) => {
    upload(req, res, (err?: unknown) => (err ? reject(err) : resolve()))
  })

type IdentityRequest = AuthenticatedMedusaRequest & {
  file?: {
    originalname: string
    mimetype: string
    size: number
    buffer: Buffer
  }
  body: Record<string, string | undefined>
}

// Identity submissions are authenticated and actor-bound. Uploaded ID images
// are validated in memory; no raw identity image is written to a public bucket.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const uploadReq = req as IdentityRequest
  const auth = req.auth_context

  try {
    await parseMultipart(uploadReq, res)
  } catch (err: any) {
    if (err?.code === "LIMIT_FILE_SIZE") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `ID document is too large — max ${KYC_DOCUMENT_MAX_BYTES / 1024 / 1024}MB`
      )
    }
    throw err
  }

  const file = uploadReq.file

  let email: string | null = null
  let phone: string | null = null
  let userType: "customer" | "seller"
  let userId = auth.actor_id as string
  let sellerAdminId: string | null = null

  if (auth.actor_type === "seller") {
    const context = await resolveSellerContext(req)
    email = context.email
    phone = context.phone
    sellerAdminId = context.sellerAdminId
    userType = "seller"
    userId = context.sellerAdminId
  } else if (auth.actor_type === "customer") {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: [customer] } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "phone"],
      filters: { id: [auth.actor_id] },
    })
    if (!customer) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Customer not found for authenticated actor."
      )
    }
    email = customer.email ?? null
    phone = customer.phone ?? null
    userType = "customer"
  } else {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "A signed-in customer or seller account is required."
    )
  }

  let extracted: unknown
  if (uploadReq.body.extracted) {
    try {
      extracted = JSON.parse(uploadReq.body.extracted)
    } catch {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "The scanned identity details could not be read."
      )
    }
  }

  const parsed = PostKycIdentitySchema.safeParse({
    email: email ?? undefined,
    phone: phone ?? undefined,
    id_type: uploadReq.body.id_type,
    id_number: uploadReq.body.id_number,
    extracted,
  })
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.issues[0]?.message ?? "Invalid identity details."
    )
  }

  const document = file ? validateKycDocument(file.buffer) : undefined
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)
  const body: Body = parsed.data
  const result = await kyc.submitIdentity({
    email,
    phone,
    userType,
    userId,
    id_type: body.id_type,
    id_number: body.id_number,
    extracted: body.extracted,
    document: document
      ? {
          sha256: document.sha256,
          mime: document.mime,
          size: document.size,
        }
      : undefined,
  })

  if (sellerAdminId) {
    await syncSellerVerificationStatus(
      req.scope,
      { email, phone },
      result.profile.id_status === "verified" ? "verified" : "pending"
    )
  }

  res.status(201).json({ ok: result.ok, profile: result.profile })
}
