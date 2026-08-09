import { redirect } from "next/navigation"

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  redirect(`/${countryCode}/account/profile#identity-verification`)
}
