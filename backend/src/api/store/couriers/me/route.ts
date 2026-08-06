import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../modules/delivery"
import KycModuleService from "../../../../modules/kyc/service"
import { KYC_MODULE } from "../../../../modules/kyc"
import BuyerWalletModuleService from "../../../../modules/buyer-wallet/service"
import { BUYER_WALLET_MODULE } from "../../../../modules/buyer-wallet"
import { resolveActorEmail } from "../../../../lib/accounts/resolve-actor-email"

// The courier dashboard: application status, KYC level, activity (offers +
// accepted jobs) and lifetime delivery earnings. Identity comes from the actor.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const email = await resolveActorEmail(req)

  const delivery = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)
  const buyerWallet = req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)

  const [profile, kycView, jobs, ledger] = await Promise.all([
    delivery.getCourierProfile(email),
    kyc.getProfileView({ email }),
    delivery.listCourierJobs(email),
    buyerWallet.listLedger(email),
  ])

  const earnings = ledger
    .filter((entry: any) => entry.source === "delivery_payout")
    .reduce((sum: number, entry: any) => sum + Number(entry.amount), 0)

  res.json({
    courier: profile ?? null,
    kyc: kycView,
    jobs,
    earnings,
  })
}
