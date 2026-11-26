// Login del Super Admin. Devuelve una cookie de sesión firmada (HttpOnly).

import { NextResponse } from "next/server";
import { dbEnabled } from "../../../../lib/db";
import { accessEnabled } from "../../../../lib/access";
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  findAdminByEmail,
  isLocked,
  registerFailedAttempt,
  registerSuccessfulLogin,
  shouldLock,
  verifyPassword,
} from "../../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request) {
  if (accessEnabled) {
    return NextResponse.json({ error: "El acceso se realiza con Cloudflare Access" }, { status: 410 });
  }
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password || password.length > 200) {
    return NextResponse.json({ error: "Correo o contraseña no válidos" }, { status: 400 });
  }

  try {
    const user = await findAdminByEmail(email);
    if (isLocked(user?.locked_until)) {
      return NextResponse.json({ error: "Demasiados intentos. Intenta en 15 minutos." }, { status: 429 });
    }

    const valid = Boolean(
      user?.active
      && user.global_role === "super_admin"
      && user.password_hash
      && await verifyPassword(password, user.password_hash),
    );

    if (!valid) {
      if (user?.id) {
        const attempts = Number(user.failed_attempts || 0) + 1;
        await registerFailedAttempt(user.id, attempts, shouldLock(attempts));
      }
      return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 });
    }

    await registerSuccessfulLogin(user.id);
    const token = await createSession({ sub: user.id, email: user.email, role: "super_admin" });
    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, role: "super_admin" },
    });
    response.cookies.set({ ...cookieOptions(request), name: SESSION_COOKIE, value: token });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
