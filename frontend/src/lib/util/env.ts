export const getBaseURL = () => {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8000"
  return base.replace(/\/+$/, "")
}
