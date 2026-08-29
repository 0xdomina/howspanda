import nextVitals from "eslint-config-next/core-web-vitals"

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      ".yarn/**",
      ".git/**",
      "e2e-shots/**",
      "e2e-shots-human/**",
    ],
  },
  ...nextVitals,
]

export default config
