import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Fail fast in production rather than silently running on the dev defaults —
// signing auth tokens with a known value is a critical exposure. Dev/test keep
// the lenient fallbacks so local work and the integration harness are untouched.
const isProduction = process.env.NODE_ENV === 'production'
const DEV_JWT = 'supersecret'
const DEV_COOKIE = 'supersecret'
if (isProduction) {
  if ((process.env.JWT_SECRET || DEV_JWT) === DEV_JWT) {
    throw new Error(
      'JWT_SECRET must be set to a non-default value when NODE_ENV=production'
    )
  }
  if ((process.env.COOKIE_SECRET || DEV_COOKIE) === DEV_COOKIE) {
    throw new Error(
      'COOKIE_SECRET must be set to a non-default value when NODE_ENV=production'
    )
  }
  const required = ["DATABASE_URL", "STORE_CORS", "ADMIN_CORS", "AUTH_CORS"]
  const missing = required.filter((name) => !process.env[name]?.trim())
  if (missing.length) {
    throw new Error(`Missing production configuration: ${missing.join(", ")}`)
  }
  const privateStorage = [
    "PRIVATE_S3_BUCKET",
    "PRIVATE_S3_ENDPOINT",
    "PRIVATE_S3_ACCESS_KEY_ID",
    "PRIVATE_S3_SECRET_ACCESS_KEY",
  ]
  const missingPrivateStorage = privateStorage.filter(
    (name) => !process.env[name]?.trim()
  )
  if (missingPrivateStorage.length) {
    throw new Error(
      `Private payment-proof storage is required in production: ${missingPrivateStorage.join(", ")}`
    )
  }
  if (
    process.env.CRYPTO_ENABLED === "true" &&
    !process.env.CRYPTO_NGN_PER_USDC?.trim()
  ) {
    throw new Error(
      "CRYPTO_NGN_PER_USDC must be set from an approved current rate before enabling USDC checkout"
    )
  }
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || DEV_JWT,
      cookieSecret: process.env.COOKIE_SECRET || DEV_COOKIE,
    }
  },
  // Media storage on any S3-compatible object store (Backblaze B2 in
  // production — B2 speaks the S3 API, so only endpoint/region differ from
  // AWS). Activates only when S3_BUCKET + keys are set; otherwise Medusa's
  // local-disk file service keeps dev working. Make the bucket's files
  // public-read via the Backblaze bucket settings and point S3_URL at the
  // bucket's public file host (or a CDN domain in front of it).
  ...((process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY)
    ? {
        file: {
          providers: [
            {
              resolve: "@medusajs/file-s3",
              id: "s3",
              options: {
                file_url: process.env.S3_URL,
                access_key_id: process.env.S3_ACCESS_KEY_ID,
                secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                region: process.env.S3_REGION,
                bucket: process.env.S3_BUCKET,
                endpoint: process.env.S3_ENDPOINT,
                prefix: process.env.S3_PREFIX || "",
                cache_control: "public, max-age=31536000, immutable",
              },
            },
          ],
        },
      }
    : {}),
  modules: [
    {
      // Default auth module with an additional `phone` provider so sellers
      // can sign in with a phone number + password (emailpass stays as-is).
      // Google OAuth is free and ships with Medusa; it only activates once
      // GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are configured.
      resolve: "@medusajs/medusa/auth",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/auth-emailpass",
            id: "emailpass",
          },
          {
            resolve: "./src/modules/auth-phone",
            id: "phone",
          },
          ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
            ? [
                {
                  resolve: "@medusajs/medusa/auth-google",
                  id: "google",
                  options: {
                    clientId: process.env.GOOGLE_CLIENT_ID,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                    callbackUrl:
                      process.env.GOOGLE_CALLBACK_URL ||
                      `${process.env.BACKEND_URL ?? "http://localhost:9000"}/auth/customer/google/callback`,
                  },
                },
              ]
            : []),
        ],
      },
    },
    {
      resolve: "./src/modules/marketplace",
    },
    {
      resolve: "./src/modules/ai",
    },
    {
      resolve: "./src/modules/redeemables",
    },
    {
      resolve: "./src/modules/reviews",
    },
    {
      resolve: "./src/modules/tipping",
    },
    {
      resolve: "./src/modules/growth",
    },
    {
      resolve: "./src/modules/buyer-wallet",
    },
    {
      resolve: "./src/modules/mall",
    },
    {
      resolve: "./src/modules/delivery",
    },
    {
      resolve: "./src/modules/kyc",
    },
    {
      resolve: "./src/modules/auth-otp",
    },
    {
      resolve: "./src/modules/payment-rails",
    },
    {
      resolve: "./src/modules/follows",
    },
    {
      resolve: "./src/modules/user-wallet",
    },
    {
      resolve: "./src/modules/notifications",
    },
    {
      resolve: "./src/modules/wishlist",
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: {
        redisUrl: process.env.REDIS_URL,
      },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: {
        redis: {
          redisUrl: process.env.REDIS_URL,
        },
      },
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        // Money-in webhook reliability: how long the core route delays the
        // event before processing and how many delivery attempts it gets.
        // The subscriber's processPaymentWorkflow is idempotent per session,
        // so redeliveries are safe.
        webhook_delay: Number(process.env.WEBHOOK_DELAY_MS ?? 5000),
        webhook_retries: Number(process.env.WEBHOOK_RETRIES ?? 3),
        providers: [
          {
            resolve: "./src/modules/payment-providers/paystack",
            id: "paystack",
            options: {
              enabled: process.env.PAYSTACK_ENABLED !== "false",
              secretKey: process.env.PAYSTACK_SECRET_KEY,
              publicKey: process.env.PAYSTACK_PUBLIC_KEY,
            },
          },
          {
            resolve: "./src/modules/payment-providers/flutterwave",
            id: "flutterwave",
            options: {
              enabled: process.env.FLUTTERWAVE_ENABLED !== "false",
              secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
              publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
            },
          },
          {
            resolve: "./src/modules/payment-providers/crypto-usdc",
            id: "crypto-usdc",
            options: {
              enabled: process.env.CRYPTO_ENABLED,
              networkEnv: process.env.CRYPTO_NETWORK_ENV,
              defaultNetwork: process.env.CRYPTO_DEFAULT_NETWORK,
              circleApiKey: process.env.CIRCLE_API_KEY,
              circleEntitySecret: process.env.CIRCLE_ENTITY_SECRET,
              circleWalletSetId: process.env.CIRCLE_WALLET_SET_ID,
            },
          },
        ],
      },
    },
  ],
})
