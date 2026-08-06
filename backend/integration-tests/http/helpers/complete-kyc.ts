import { KYC_MODULE } from "../../../src/modules/kyc"
import KycModuleService from "../../../src/modules/kyc/service"

// Reach the profile_completed rung of the KYC ladder for an email directly
// through the service (no OTP/message provider needed in tests): mark the phone
// verified and save the personal profile. Seller/courier actions that are
// ladder-gated depend on this so specs can reach them.
export async function completeKycLadder(
  getContainer: () => any,
  email: string,
  phone: string
): Promise<void> {
  const kyc: KycModuleService = getContainer().resolve(KYC_MODULE)
  const profile = await kyc.getOrCreateProfile({ email, phone })
  await kyc.updateKycProfiles({
    id: profile.id,
    phone,
    phone_verified_at: new Date(),
  })
  await kyc.saveProfile({
    email,
    phone,
    first_name: "Test",
    last_name: "User",
    address: "1 Test Street",
    country: "NG",
    state: "Lagos",
    city: "Ikeja",
  })
}
