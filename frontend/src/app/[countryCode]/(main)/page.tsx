import { Metadata } from "next"

import EcommerceHome from "@modules/home/components/ecommerce-home"
import Footer from "@modules/layout/templates/footer"

export const metadata: Metadata = {
  title: "Shop more. Sell more.",
  description:
    "How's u is a marketplace where informal sellers, buyers, and couriers win. Buy from people, sell what you make, and get paid on time.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  return (
    <>
      <EcommerceHome countryCode={params.countryCode} />
      <Footer />
    </>
  )
}
