// Devuelve el usuario autenticado, o 401 si no hay sesión válida.

import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, user });
}
