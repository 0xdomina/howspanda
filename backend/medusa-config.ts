import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  modules: [
    {
      resolve: "./src/modules/marketplace",
    },
    {
      resolve: "./src/modules/ai",
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
        providers: [
          {
            resolve: "./src/modules/payment-providers/paystack",
            id: "paystack",
            options: {
              secretKey: process.env.PAYSTACK_SECRET_KEY,
              publicKey: process.env.PAYSTACK_PUBLIC_KEY,
            },
          },
          {
            resolve: "./src/modules/payment-providers/flutterwave",
            id: "flutterwave",
            options: {
              secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
              publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
            },
          },
        ],
      },
    },
  ],
})
