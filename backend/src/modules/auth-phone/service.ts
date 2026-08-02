import { isString, MedusaError } from "@medusajs/framework/utils"
import { AbstractAuthModuleProvider } from "@medusajs/framework/utils"
import {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityDTO,
  AuthIdentityProviderService,
  Logger,
} from "@medusajs/framework/types"
import scryptKdf from "scrypt-kdf"
import { isPresent } from "@medusajs/utils"

type InjectedDependencies = {
  logger: Logger
}

type PhoneAuthProviderOptions = {
  hashConfig?: { logN: number; r: number; p: number }
}

// Phone + password auth provider. Mirrors the built-in emailpass provider
// but keys the identity on a normalized phone number. Signing up with a phone
// number IS the phone verification (the credential proves ownership), so KYC
// never re-verifies it — KYC only covers the complementary identifier (email)
// plus identity details.
class PhoneAuthService extends AbstractAuthModuleProvider {
  static identifier = "phone"
  static DISPLAY_NAME = "Phone/Password Authentication"

  protected config_: PhoneAuthProviderOptions
  protected logger_: Logger

  constructor({ logger }: InjectedDependencies, options: PhoneAuthProviderOptions) {
    // @ts-ignore
    super(...arguments)
    this.config_ = options
    this.logger_ = logger
  }

  async hashPassword(password: string): Promise<string> {
    const hashConfig = this.config_.hashConfig ?? { logN: 15, r: 8, p: 1 }
    const passwordHash = await scryptKdf.kdf(password, hashConfig)
    return passwordHash.toString("base64")
  }

  async update(
    data: { password: string; entity_id: string },
    authIdentityService: AuthIdentityProviderService
  ): Promise<{
    success: boolean
    error?: any
    authIdentity?: AuthIdentityDTO
  }> {
    const { password, entity_id } = data ?? {}
    if (!entity_id) {
      return {
        success: false,
        error: `Cannot update ${this.provider} provider identity without entity_id`,
      }
    }
    if (!password || !isString(password)) {
      return { success: true }
    }

    let authIdentity
    try {
      const passwordHash = await this.hashPassword(password)
      const providerMetadata = await this.getProviderMetadata_(entity_id, authIdentityService)
      authIdentity = await authIdentityService.update(entity_id, {
        provider_metadata: {
          ...providerMetadata,
          password: passwordHash,
        },
      })
    } catch (error) {
      return { success: false, error: error.message }
    }

    return {
      success: true,
      authIdentity: this.sanitizeAuthIdentity_(authIdentity),
    }
  }

  async authenticate(
    userData: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    const { phone, password } = (userData.body ?? {}) as {
      phone?: string
      password?: string
    }
    if (!password || !isString(password)) {
      return { success: false, error: "Password should be a string" }
    }
    if (!phone || !isString(phone)) {
      return { success: false, error: "Phone should be a string" }
    }

    const entityId = this.normalizePhone_(phone)

    let authIdentity
    try {
      authIdentity = await authIdentityService.retrieve({
        entity_id: entityId,
      })
    } catch (error) {
      if (error.type === MedusaError.Types.NOT_FOUND) {
        return { success: false, error: "Invalid phone or password" }
      }
      return { success: false, error: error.message }
    }

    const providerIdentity = authIdentity.provider_identities?.find(
      (pi) => pi.provider === this.provider
    )
    const passwordHash = providerIdentity.provider_metadata?.password
    if (isString(passwordHash)) {
      const buf = Buffer.from(passwordHash, "base64")
      const success = await scryptKdf.verify(buf, password)
      if (success) {
        return {
          success,
          authIdentity: this.sanitizeAuthIdentity_(authIdentity),
        }
      }
    }

    return { success: false, error: "Invalid phone or password" }
  }

  async register(
    userData: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    const { phone, password } = (userData.body ?? {}) as {
      phone?: string
      password?: string
    }
    if (!password || !isString(password)) {
      return { success: false, error: "Password should be a string" }
    }
    if (!phone || !isString(phone)) {
      return { success: false, error: "Phone should be a string" }
    }

    const entityId = this.normalizePhone_(phone)

    try {
      const identity = await authIdentityService.retrieve({
        entity_id: entityId,
      })
      // If app_metadata is not defined or empty, it means no actor was
      // assigned to the auth_identity yet (still "claimable").
      if (!isPresent(identity.app_metadata)) {
        const updatedAuthIdentity = await this.upsertAuthIdentity("update", {
          phone: entityId,
          password,
          authIdentityService,
        })
        return {
          success: true,
          authIdentity: updatedAuthIdentity,
        }
      }
      return {
        success: false,
        error: "Identity with phone already exists",
      }
    } catch (error) {
      if (error.type === MedusaError.Types.NOT_FOUND) {
        const createdAuthIdentity = await this.upsertAuthIdentity("create", {
          phone: entityId,
          password,
          authIdentityService,
        })
        return {
          success: true,
          authIdentity: createdAuthIdentity,
        }
      }
      return { success: false, error: error.message }
    }
  }

  async upsertAuthIdentity(
    type: "create" | "update",
    {
      phone,
      password,
      authIdentityService,
    }: {
      phone: string
      password: string
      authIdentityService: AuthIdentityProviderService
    }
  ): Promise<AuthIdentityDTO> {
    const passwordHash = await this.hashPassword(password)
    const providerMetadata =
      type === "update"
        ? await this.getProviderMetadata_(phone, authIdentityService)
        : {}
    providerMetadata.password = passwordHash

    const authIdentity =
      type === "create"
        ? await authIdentityService.create({
            entity_id: phone,
            provider_metadata: providerMetadata,
          })
        : await authIdentityService.update(phone, {
            provider_metadata: providerMetadata,
          })

    return this.sanitizeAuthIdentity_(authIdentity)
  }

  async getProviderMetadata_(
    entityId: string,
    authIdentityService: AuthIdentityProviderService
  ): Promise<Record<string, unknown>> {
    const authIdentity = await authIdentityService.retrieve({
      entity_id: entityId,
    })
    const providerIdentity = this.getProviderIdentity_(authIdentity)
    return {
      ...(providerIdentity?.provider_metadata ?? {}),
    }
  }

  sanitizeAuthIdentity_(authIdentity: AuthIdentityDTO): AuthIdentityDTO {
    const copy = JSON.parse(JSON.stringify(authIdentity))
    const providerIdentity = this.getProviderIdentity_(copy)
    delete providerIdentity?.provider_metadata?.password
    return copy
  }

  getProviderIdentity_(authIdentity: AuthIdentityDTO) {
    return authIdentity.provider_identities?.find(
      (pi) => pi.provider === this.provider
    )
  }

  /**
   * Normalize a phone number to a stable entity_id. Trim whitespace; keep
   * digits/+/spaces as-is so regional formatting is preserved while still
   * collapsing obvious duplicates (e.g. trailing whitespace).
   */
  normalizePhone_(phone: string): string {
    return phone.trim().replace(/\s+/g, "")
  }
}

export default PhoneAuthService
