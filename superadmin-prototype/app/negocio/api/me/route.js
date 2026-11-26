// Panel independiente del negocio.
// La identidad viene de la sesión con contraseña; Access solo interviene en la
// ruta de recuperación. Ningún parámetro de la URL puede elegir el negocio.

import { NextResponse } from "next/server";
import { dbEnabled, runAsTenant } from "../../../../lib/db";
import { getTenantAccessEmail } from "../../../../lib/access";
import {
  findUserByEmail, getTenantMfa, getTenantSession,
} from "../../../../lib/auth";
import { resolveTenantIdentity } from "../../../../lib/tenant-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });

  let email = null;
  let viaSession = false;

  const session = await getTenantSession(request);
  if (session) {
    try {
      const user = await findUserByEmail(session.email);
      if (user && user.id === session.sub && user.epoch === session.epoch) {
        email = user.email;
        viaSession = true;
      }
    } catch {
      email = null;
    }
  }

  // Respaldo para el primer acceso y para desarrollo local sin secrets.
  if (!email) email = await getTenantAccessEmail(request);
  if (!email && process.env.NODE_ENV !== "production") {
    email = (request.headers.get("x-dev-email") || "").toLowerCase() || null;
  }
  if (!email) {
    return NextResponse.json({
      error: "Inicia sesión con tu correo y contraseña para entrar al negocio.",
      needsLogin: true,
    }, { status: 401 });
  }

  try {
    const identity = await resolveTenantIdentity(email);
    if (!identity) {
      return NextResponse.json({
        error: "Tu correo no está vinculado a ningún negocio. Pide al administrador que te invite.",
        email,
      }, { status: 403 });
    }

    const results = await runAsTenant(identity.tenant_id, (tx) => [
      tx`
        select id, slug, name, niche, country_name, city, status, isolation_mode,
               health_score, brand, settings, mrr, users_count, created_at
        from public.tenants where id = ${identity.tenant_id}::uuid
      `,
      tx`
        select p.name as plan_name, p.tagline, p.color, s.status as subscription_status,
               s.starts_at
        from public.subscriptions s join public.plans p on p.id = s.plan_id
        where s.tenant_id = ${identity.tenant_id}::uuid
        order by s.starts_at desc limit 1
      `,
      tx`
        select l.max_users, l.max_sites, l.max_products, l.max_invoices_month,
               l.storage_gb, l.api_calls_month, l.max_languages, l.max_currencies,
               l.audit_retention_days, l.support_level
        from public.plan_limits l
        join public.subscriptions s on s.plan_id = l.plan_id
        where s.tenant_id = ${identity.tenant_id}::uuid limit 1
      `,
      tx`
        select m.label, m.category, pm.access
        from public.plan_modules pm
        join public.modules m on m.id = pm.module_id
        join public.subscriptions s on s.plan_id = pm.plan_id
        where s.tenant_id = ${identity.tenant_id}::uuid and pm.access <> 'off'
        order by m.category, m.label
      `,
      tx`
        select number, amount, currency, status, issued_at
        from public.invoices where tenant_id = ${identity.tenant_id}::uuid
        order by issued_at desc limit 10
      `,
      tx`
        select role, count(*)::int as total from public.tenant_members
        where tenant_id = ${identity.tenant_id}::uuid group by role order by role
      `,
      tx`
        insert into public.audit_log
          (tenant_id, actor_id, actor_role, action, object_type, object_id, metadata)
        values
          (${identity.tenant_id}::uuid, ${identity.user_id}::uuid, ${identity.role},
           'tenant_panel_open', 'tenant', ${identity.tenant_key},
           ${JSON.stringify({ source: viaSession ? "password_session" : "access", email })}::jsonb)
      `,
    ], identity.role === "owner" ? "tenant_owner" : "tenant_user", identity.user_id);

    const tenant = results[0][0] || null;
    if (!tenant) return NextResponse.json({ error: "Sin acceso a este negocio" }, { status: 403 });

    const account = await findUserByEmail(email).catch(() => null);
    const mfa = account ? await getTenantMfa(account.id).catch(() => null) : null;

    return NextResponse.json({
      mode: "neon",
      email,
      role: identity.role,
      authMode: viaSession ? "password" : "access",
      hasPassword: Boolean(account?.password_hash),
      mfaEnabled: Boolean(mfa?.enabled),
      tenant: {
        id: identity.tenant_key,
        name: tenant.name,
        niche: tenant.niche,
        country: tenant.country_name,
        city: tenant.city,
        status: tenant.status,
        isolation: tenant.isolation_mode,
        health: tenant.health_score,
        mrr: Number(tenant.mrr),
        users: tenant.users_count,
        color: tenant.brand?.color || "#6366f1",
        created: tenant.created_at,
      },
      plan: results[1][0] || null,
      limits: results[2][0] || null,
      modules: results[3],
      invoices: results[4],
      team: results[5],
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
