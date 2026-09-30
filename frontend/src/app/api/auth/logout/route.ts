import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ message: "Invalid logout origin." }, { status: 403 })
  }

  const response = NextResponse.json({ ok: true })
  // Medusa tokens plus every Better Auth session cookie variant. Production
  // serves over HTTPS, where Better Auth uses the __Secure- prefix — missing
  // those left users "logged in" after logout.
  for (const name of [
    "_medusa_jwt",
    "_medusa_seller_jwt",
    "_medusa_cart_id",
    "better-auth.session_token",
    "__Secure-better-auth.session_token",
    "better-auth.session_data",
    "__Secure-better-auth.session_data",
    "better-auth.dont_remember",
    "__Secure-better-auth.dont_remember",
  ]) {
    response.cookies.set(name, "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    })
  }
  return response
}
