// Cierra la sesión borrando la cookie firmada.

import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOptions } from "../../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    ...cookieOptions(request),
    name: SESSION_COOKIE,
    value: "",
    maxAge: 0,
  });
  return response;
}
