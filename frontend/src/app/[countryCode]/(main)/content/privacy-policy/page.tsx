import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How's u Privacy Policy — how we collect, use and protect your data.",
}

export default async function PrivacyPolicyPage() {
  return (
    <div className="figma-container py-10 small:py-16">
      <div className="figma-surface mx-auto max-w-3xl p-6 small:p-10">
      <h1 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Privacy Policy
      </h1>
      <div className="prose prose-sm mt-6 space-y-4 text-sm leading-relaxed text-ink">
        <p>
          This Privacy Policy explains how How&rsquo;s u collects, uses and
          protects your personal information when you use our marketplace.
        </p>
        <h2 className="font-display text-base font-medium text-ink">Information we collect</h2>
        <p>
          We collect the information you provide when you create an account or
          place an order — such as your name, email address, phone number and
          delivery address — as well as transaction records needed to process
          payments and payouts.
        </p>
        <h2 className="font-display text-base font-medium text-ink">How we use it</h2>
        <p>
          Your information is used to operate the marketplace: process orders,
          facilitate payments and payouts, prevent fraud, and communicate about
          your account. We do not sell your personal information.
        </p>
        <h2 className="font-display text-base font-medium text-ink">Data sharing</h2>
        <p>
          We share information only with service providers who help run the
          platform (such as payment processors and delivery partners) and only
          to the extent necessary to provide those services.
        </p>
        <h2 className="font-display text-base font-medium text-ink">Your rights</h2>
        <p>
          You may access, correct or delete your personal information at any
          time through your account settings, or by contacting support.
        </p>
        <h2 className="font-display text-base font-medium text-ink">Contact</h2>
        <p>
          Questions about this policy can be directed to our support team via
          the marketplace.
        </p>
      </div>
    </div>
    </div>
  )
}
