import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveCustomer } from "@lib/data/customer"
import { retrieveKycStatus } from "@lib/data/kyc"
import VerificationClient from "@modules/account/components/verification"

export const metadata: Metadata = {
  title: "Verification",
  description: "Verify your identity to unlock selling and delivering.",
}

export default async function VerificationPage() {
  const customer = await retrieveCustomer().catch(() => null)

  if (!customer) {
    notFound()
  }

  const kyc = await retrieveKycStatus(customer.email).catch(() => null)

  return (
    <VerificationClient
      email={customer.email ?? ""}
      phone={customer.phone ?? ""}
      kyc={kyc}
    />
  )
}
