// MFA opcional (TOTP) para el acceso del negocio. Requiere sesión con contraseña.

import { NextResponse } from "next/server";
import { dbEnabled, runAsSuperAdmin } from "../../../../lib/db";
import { getTenantSession, findUserByEmail, getTenantMfa } from "../../../../lib/auth";
import { generateTotpSecret, totpUri, verifyTotp } from "../../../../lib/totp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

async function currentUser(request) {
  const session = await getTenantSession(request);
  if (!session) return null;
  const user = await findUserByEmail(session.email);
  if (!user || user.id !== session.sub || user.epoch !== session.epoch) return null;
  return user;
}

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
    const mfa = await getTenantMfa(user.id);
    if (mfa?.enabled) return NextResponse.json({ enabled: true });

    const secret = generateTotpSecret();
    await runAsSuperAdmin((tx) => tx`
      insert into public.tenant_mfa (user_id, secret, enabled)
      values (${user.id}::uuid, ${secret}, false)
      on conflict (user_id) do update set secret = excluded.secret, enabled = false
    `);
    return NextResponse.json({
      enabled: false,
      secret,
      uri: totpUri(secret, user.email),
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function POST(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });

    let body;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const action = String(body?.action || "");
    const code = String(body?.code || "").trim();
    if (action !== "enable" && action !== "disable") {
      return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    }

    const mfa = await getTenantMfa(user.id);
    if (!mfa) return NextResponse.json({ error: "Genera primero el código QR" }, { status: 400 });
    if (!await verifyTotp(mfa.secret, code)) {
      return NextResponse.json({ error: "Código incorrecto" }, { status: 401 });
    }

    await runAsSuperAdmin((tx) => tx`
      update public.tenant_mfa set enabled = ${action === "enable"} where user_id = ${user.id}::uuid
    `);
    return NextResponse.json({ ok: true, enabled: action === "enable" });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
