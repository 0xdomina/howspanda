const checkEnvVariables = require("./check-env-variables")

checkEnvVariables()

/**
 * Medusa Cloud-related environment variables
 */
const S3_HOSTNAME = process.env.MEDUSA_CLOUD_S3_HOSTNAME
const S3_PATHNAME = process.env.MEDUSA_CLOUD_S3_PATHNAME

/**
 * Extra media hosts next/image may load from — comma-separated hostnames.
 * Set MEDIA_IMAGE_HOSTNAMES in production to the Backblaze B2 public host
 * (e.g. f004.backblazeb2.com) or the CDN domain in front of it.
 */
const mediaImageHostnames = (process.env.MEDIA_IMAGE_HOSTNAMES || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean)

// Vercel can serve the same production build through its canonical alias and
// deployment host. Explicitly allow only How's U hosts for Server Actions so
// Next's CSRF origin check works through that proxy without opening actions to
// arbitrary origins.
const serverActionOrigins = [
  "hows-u.vercel.app",
  "hows-*.alpherxs-projects.vercel.app",
  ...(process.env.VERCEL_URL ? [process.env.VERCEL_URL] : []),
  "localhost:8000",
]

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Vercel supplies its own server output and build tracing. Keep standalone
  // output for container deployments, but do not make Vercel post-processing
  // look for the container-only NFT manifest.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    serverActions: {
      allowedOrigins: serverActionOrigins,
    },
  },
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV !== "production",
    },
  },
  images: {
    qualities: [50, 75],
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "medusa-server-testing.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "medusa-server-testing.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      ...(S3_HOSTNAME && S3_PATHNAME
        ? [
            {
              protocol: "https",
              hostname: S3_HOSTNAME,
              pathname: S3_PATHNAME,
            },
          ]
        : []),
      ...mediaImageHostnames.map((hostname) => ({
        protocol: "https",
        hostname,
      })),
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
