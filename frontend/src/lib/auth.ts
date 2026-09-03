import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"

// Neon serverless - works on Vercel Edge/Node, branches with DB
const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql)

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  },
  trustedOrigins: [
    process.env.NEXT_PUBLIC_BASE_URL || "https://hows-u.vercel.app",
    "http://localhost:8000",
  ],
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "howsu-better-auth-secret-2026-change-me",
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://hows-u.vercel.app",
})

export type Session = typeof auth.$Infer.Session
