// Crear o cambiar la contraseña del negocio.
// esta ruta está detrás de Cloudflare Access con One-time PIN. El correo se toma
// del JWT verificado, nunca del formulario. En el código se vuelve a validar el
// JWT como defensa en profundidad (si alguien cambia la ruta en Access).

import { NextResponse } from "next/server";
import { dbEnabled, runAsSuperAdmin } from "../../../../lib/db";
import { getTenantAccessEmail } from "../../../../lib/access";
import { resolveTenantIdentity } from "../../../../lib/tenant-identity";
import { findUserByEmail, hashPassword, rotateTenantSession } from "../../../../lib/auth";
import { uuidFor } from "../../../../lib/state-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function verifiedIdentity(request) {
  const email = await getTenantAccessEmail(request);
  if (!email) return { error: NextResponse.json({ error: "Verifica tu correo con Cloudflare Access" }, { status: 401 }) };
  const identity = await resolveTenantIdentity(email);
  if (!identity) {
    return {
      error: NextResponse.json({
        error: "Tu correo no está vinculado a ningún negocio. Pide al administrador que te invite.",
      }, { status: 403 }),
    };
  }
  return { email, identity };
}

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  try {
    const { email, identity, error } = await verifiedIdentity(request);
    if (error) return error;
    const user = await findUserByEmail(email);
    return NextResponse.json({
      email,
      tenant: identity.tenant_name,
      hasPassword: Boolean(user?.password_hash),
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function POST(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  try {
    const { email, identity, error } = await verifiedIdentity(request);
    if (error) return error;

    let body;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const password = String(body?.password || "");
    if (password.length < 12 || password.length > 200) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 12 caracteres" }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      await runAsSuperAdmin((tx) => tx`
        insert into auth.users (id, email)
        values (${uuidFor(`user:${email}`)}::uuid, ${email})
        on conflict (email) do nothing
      `);
    }

    const hash = await hashPassword(password);
    await runAsSuperAdmin((tx) => [
      tx`
        update auth.users
        set password_hash = ${hash}, failed_attempts = 0, locked_until = null
        where lower(email) = lower(${email})
      `,
    ]);
    // La contraseña nueva invalida cualquier sesión que estuviera abierta.
    await rotateTenantSession(identity.user_id);

    return NextResponse.json({ ok: true, email, tenant: identity.tenant_name });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
