import { Metadata } from "next"

export const metadata: Metadata = { title: "Contact", description: "Contact the How’s U team." }

export default function ContactPage() {
  return (
    <main className="figma-container grid gap-8 py-16 small:grid-cols-[340px_1fr] small:py-24">
      <section className="rounded-control border border-ink-hairline p-8"><h1 className="font-display text-3xl font-semibold">Get in touch</h1><p className="mt-4 text-sm leading-6 text-ink-muted">We are available 24/7, 7 days a week.</p><p className="mt-6 text-sm">Phone: +234 800 000 0000</p><p className="mt-4 text-sm">Email: support@howsu.com</p></section>
      <form action="mailto:support@howsu.com" method="post" encType="text/plain" className="rounded-control bg-[#f5f5f5] p-6 small:p-10"><div className="grid gap-4 small:grid-cols-3"><input name="name" required placeholder="Your Name" className="rounded-control border-0 bg-white px-4 py-4 text-sm outline-none" /><input name="email" required type="email" placeholder="Your Email" className="rounded-control border-0 bg-white px-4 py-4 text-sm outline-none" /><input name="phone" placeholder="Your Phone" className="rounded-control border-0 bg-white px-4 py-4 text-sm outline-none" /></div><textarea name="message" required placeholder="Your Message" className="mt-4 min-h-52 w-full resize-y rounded-control border-0 bg-white px-4 py-4 text-sm outline-none" /><button type="submit" className="figma-button mt-4">Send Message</button></form>
    </main>
  )
}
