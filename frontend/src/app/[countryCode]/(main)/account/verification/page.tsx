import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveCustomer } from "@lib/data/customer"
import { retrieveFeatures, retrieveMyKyc } from "@lib/data/kyc"
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

  const [kyc, features] = await Promise.all([
    retrieveMyKyc(customer.email, customer.phone).catch(() => null),
    retrieveFeatures(),
  ])

  return (
    <VerificationClient
      email={customer.email ?? ""}
      phone={customer.phone ?? ""}
      kyc={kyc}
      features={features}
      customerName={{
        first_name: customer.first_name,
        last_name: customer.last_name,
      }}
    />
  )
}
