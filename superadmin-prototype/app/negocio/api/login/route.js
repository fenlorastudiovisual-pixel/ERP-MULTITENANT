// Login del panel del negocio con contraseña. Access NO interviene aquí.
// Si el dueño activó MFA, se pide además el código TOTP.

import { NextResponse } from "next/server";
import { dbEnabled } from "../../../../lib/db";
import {
  TENANT_SESSION_COOKIE, tenantCookieOptions, createTenantSession,
  findUserByEmail, getTenantMfa, hashPassword, isLocked, needsRehash,
  registerFailedAttempt, registerSuccessfulLogin, shouldLock, verifyPassword,
} from "../../../../lib/auth";
import { resolveTenantIdentity } from "../../../../lib/tenant-identity";
import { verifyTotp } from "../../../../lib/totp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

const badCredentials = () =>
  NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 });

export async function POST(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const code = String(body?.code || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password || password.length > 200) {
    return NextResponse.json({ error: "Correo o contraseña no válidos" }, { status: 400 });
  }

  try {
    // Resolver primero el negocio evita distinguir "correo inexistente" de
    // "contraseña incorrecta": ambos devuelven el mismo error genérico.
    const identity = await resolveTenantIdentity(email);
    if (!identity) return badCredentials();

    const user = await findUserByEmail(email);
    if (!user?.active || !user.id) return badCredentials();
    if (isLocked(user.locked_until)) {
      return NextResponse.json({ error: "Demasiados intentos. Intenta en 15 minutos." }, { status: 429 });
    }

    const valid = Boolean(user.password_hash && await verifyPassword(password, user.password_hash));
    if (!valid) {
      const attempts = Number(user.failed_attempts || 0) + 1;
      await registerFailedAttempt(user.id, attempts, shouldLock(attempts));
      return badCredentials();
    }

    const mfa = await getTenantMfa(identity.user_id);
    if (mfa?.enabled) {
      if (!code) return NextResponse.json({ mfaRequired: true });
      if (!await verifyTotp(mfa.secret, code)) {
        return NextResponse.json({ error: "Código de verificación incorrecto" }, { status: 401 });
      }
    }

    const upgradedHash = needsRehash(user.password_hash) ? await hashPassword(password) : null;
    await registerSuccessfulLogin(user.id, upgradedHash);

    const token = await createTenantSession({
      sub: user.id,
      email: user.email,
      tenantId: identity.tenant_id,
      role: identity.role === "owner" ? "tenant_owner" : "tenant_user",
      epoch: user.epoch,
    });
    const response = NextResponse.json({ ok: true, tenant: identity.tenant_key });
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
