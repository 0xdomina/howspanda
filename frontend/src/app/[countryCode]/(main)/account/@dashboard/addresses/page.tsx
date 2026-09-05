import { redirect } from "next/navigation"

// Shipping addresses now live on the profile page (one address book, not
// two). This route stays as a redirect so bookmarks and old links keep
// working instead of hitting a dead end.
export default async function Addresses(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params
  redirect(`/${params.countryCode}/account/profile#shipping-addresses`)
}
