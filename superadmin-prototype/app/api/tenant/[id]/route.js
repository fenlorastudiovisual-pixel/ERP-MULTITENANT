// Vista del cliente: lee un tenant usando su contexto RLS, nunca como super admin.
// Solo un Super Admin autenticado (Cloudflare Access) puede abrirla.

import { NextResponse } from "next/server";
import { dbEnabled, runAsSuperAdmin, runAsTenant } from "../../../../lib/db";
import { getSessionUser } from "../../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const admin = await getSessionUser(request);
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const key = String(id || "");
  if (!/^t\d+$/.test(key)) {
    return NextResponse.json({ error: "Identificador de negocio no válido" }, { status: 400 });
  }

  try {
    const found = await runAsSuperAdmin((tx) => tx`
      select id, name, source_key from public.tenants where source_key = ${key}
    `);
    const tenantRow = found[0];
    if (!tenantRow) {
      return NextResponse.json({ error: "Negocio no encontrado. Guarda los cambios y vuelve a intentar." }, { status: 404 });
    }

    // A partir de aquí todo se lee como tenant_user con app.tenant_id fijado.
    const results = await runAsTenant(tenantRow.id, (tx) => [
      tx`
        select id, slug, name, niche, country_name, city, status, isolation_mode,
               health_score, brand, settings, mrr, users_count, created_at
        from public.tenants where id = ${tenantRow.id}::uuid
      `,
      tx`
        select p.name as plan_name, p.tagline, p.color, s.status as subscription_status,
               s.starts_at
        from public.subscriptions s join public.plans p on p.id = s.plan_id
        where s.tenant_id = ${tenantRow.id}::uuid
        order by s.starts_at desc limit 1
      `,
      tx`
        select l.max_users, l.max_sites, l.max_products, l.max_invoices_month,
               l.storage_gb, l.api_calls_month, l.max_languages, l.max_currencies,
               l.audit_retention_days, l.support_level
        from public.plan_limits l
        join public.subscriptions s on s.plan_id = l.plan_id
        where s.tenant_id = ${tenantRow.id}::uuid limit 1
      `,
      tx`
        select m.label, m.category, pm.access
        from public.plan_modules pm
        join public.modules m on m.id = pm.module_id
        join public.subscriptions s on s.plan_id = pm.plan_id
        where s.tenant_id = ${tenantRow.id}::uuid and pm.access <> 'off'
        order by m.category, m.label
      `,
      tx`
        select number, amount, currency, status, issued_at
        from public.invoices where tenant_id = ${tenantRow.id}::uuid
        order by issued_at desc limit 10
      `,
      tx`
        select role, count(*)::int as total from public.tenant_members
        where tenant_id = ${tenantRow.id}::uuid group by role order by role
      `,
      tx`
        insert into public.audit_log
          (tenant_id, actor_id, actor_role, action, object_type, object_id, metadata)
        values
          (${tenantRow.id}::uuid, ${admin.id}::uuid, 'super_admin',
           'tenant_view_open', 'tenant', ${key},
           ${JSON.stringify({ source: "superadmin_console" })}::jsonb)
      `,
    ], "tenant_user", admin.id);

    const tenant = results[0][0] || null;
    if (!tenant) return NextResponse.json({ error: "Sin acceso a este negocio" }, { status: 403 });

    return NextResponse.json({
      mode: "neon",
      tenant: {
        id: key,
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
