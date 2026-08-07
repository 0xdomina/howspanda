import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "How's u Terms of Use — the terms that govern your use of the marketplace.",
}

export default async function TermsOfUsePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Terms of Use
      </h1>
      <div className="prose prose-sm mt-6 space-y-4 text-sm leading-relaxed text-ink">
        <p>
          These Terms of Use govern your use of the How&rsquo;s u marketplace,
          whether you shop as a customer or sell as a merchant.
        </p>
        <h2 className="font-display text-base font-medium text-ink">Using the marketplace</h2>
        <p>
          By creating an account you agree to provide accurate information and
          to use the platform lawfully. You are responsible for keeping your
          account credentials secure.
        </p>
        <h2 className="font-display text-base font-medium text-ink">Orders and payments</h2>
        <p>
          When you place an order you agree to pay the listed price through the
          available payment methods. Escrow releases funds to sellers once an
          order is confirmed delivered, subject to our return and dispute
          process.
        </p>
        <h2 className="font-display text-base font-medium text-ink">Selling on How&rsquo;s u</h2>
        <p>
          Merchants agree to list genuine goods and fulfil orders as described.
          We may hold or withhold payouts in cases of fraud, disputes or
          violations of these terms.
        </p>
        <h2 className="font-display text-base font-medium text-ink">Limitation of liability</h2>
        <p>
          The marketplace is provided &ldquo;as is&rdquo;. To the maximum extent
          permitted by law, we are not liable for indirect or consequential
          losses arising from your use of the platform.
        </p>
        <h2 className="font-display text-base font-medium text-ink">Changes</h2>
        <p>
          We may update these terms from time to time. Continued use of the
          marketplace after changes are posted constitutes acceptance of the
          updated terms.
        </p>
      </div>
    </div>
  )
}
