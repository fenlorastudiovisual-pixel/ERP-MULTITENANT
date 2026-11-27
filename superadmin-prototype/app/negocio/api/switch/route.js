// Cambio de empresa dentro del mismo panel. La sesión se vuelve a firmar con
// el tenant elegido solo después de validar membresía activa.

import { NextResponse } from "next/server";
import { dbEnabled } from "../../../../lib/db";
import { getTenantAccessEmail } from "../../../../lib/access";
import {
  TENANT_SESSION_COOKIE, tenantCookieOptions, createTenantSession,
  findUserByEmail, getTenantSession,
} from "../../../../lib/auth";
import { resolveTenantIdentity } from "../../../../lib/tenant-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const tenantId = String(body?.tenantId || "").trim();
  if (!tenantId) return NextResponse.json({ error: "Falta la empresa destino" }, { status: 400 });

  let email = null;
  const session = await getTenantSession(request);
  if (session) {
    try {
      const user = await findUserByEmail(session.email);
      if (user && user.id === session.sub && user.epoch === session.epoch) email = user.email;
    } catch {
      email = null;
    }
  }
  if (!email) email = await getTenantAccessEmail(request);
  if (!email && process.env.NODE_ENV !== "production") {
    email = (request.headers.get("x-dev-email") || "").toLowerCase() || null;
  }
  if (!email) {
    return NextResponse.json({ error: "Inicia sesión para cambiar de empresa." }, { status: 401 });
  }

  try {
    const identity = await resolveTenantIdentity(email, tenantId);
    if (!identity) {
      return NextResponse.json({ error: "No tienes acceso a esa empresa." }, { status: 403 });
    }
    const user = await findUserByEmail(email);
    if (!user?.active || user.id !== identity.user_id) {
      return NextResponse.json({ error: "No tienes acceso a esa empresa." }, { status: 403 });
    }

    const token = await createTenantSession({
      sub: user.id,
      email: user.email,
      tenantId: identity.tenant_id,
      role: identity.role === "owner" ? "tenant_owner" : "tenant_user",
      epoch: user.epoch,
    });
    const response = NextResponse.json({
      ok: true,
      tenant: identity.tenant_key,
      name: identity.tenant_name,
      role: identity.role,
    });
    response.cookies.set({
      ...tenantCookieOptions(request),
      name: TENANT_SESSION_COOKIE,
      value: token,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
