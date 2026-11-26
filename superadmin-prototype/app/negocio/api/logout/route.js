// Cierra la sesión del panel del negocio borrando su cookie propia.

import { NextResponse } from "next/server";
import { TENANT_SESSION_COOKIE } from "../../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clearCookie(request, path) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${TENANT_SESSION_COOKIE}=; Path=${path}; Max-Age=0; ` +
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure}`;
}

export async function POST(request) {
  const response = NextResponse.json({ ok: true });
  // NextResponse.cookies.set() agrupa por nombre: dos llamadas con el mismo
  // nombre se sobrescriben. Por eso se envían dos cabeceras Set-Cookie reales,
  // una para la ruta actual y otra para la raíz (cookies de versiones anteriores).
  response.headers.append("Set-Cookie", clearCookie(request, "/negocio"));
  response.headers.append("Set-Cookie", clearCookie(request, "/"));
  return response;
}
