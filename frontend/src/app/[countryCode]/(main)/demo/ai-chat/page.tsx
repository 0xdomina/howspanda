import { redirect } from "next/navigation"

type LegacyAiPageProps = {
  params: Promise<{ countryCode: string }>
}

export default async function LegacyAiPage({ params }: LegacyAiPageProps) {
  const { countryCode } = await params
  redirect(`/${countryCode}/ai`)
}
