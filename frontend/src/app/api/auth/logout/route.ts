import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ message: "Invalid logout origin." }, { status: 403 })
  }

  const response = NextResponse.json({ ok: true })
  for (const name of ["_medusa_jwt", "_medusa_seller_jwt", "_medusa_cart_id"]) {
    response.cookies.set(name, "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
    })
  }
  return response
}
