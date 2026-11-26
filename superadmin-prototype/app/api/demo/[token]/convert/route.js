// Convierte una demo en tenant real del Super Admin, conservando el correo del
// lead como owner. Requiere sesión de Super Admin.

import { NextResponse } from "next/server";
import { dbEnabled, runAsSuperAdmin } from "../../../../../lib/db";
import { getSessionUser } from "../../../../../lib/auth";
import { buildSyncQueries } from "../../../../../lib/state-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request, { params }) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  if (!(await getSessionUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { token } = await params;
  try {
    const rows = await runAsSuperAdmin((tx) => tx`
      select token, niche_id, business_name, payload, lead, converted_tenant
      from public.demo_links where token = ${String(token)}
    `);
    const demo = rows[0];
    if (!demo) return NextResponse.json({ error: "Demo no encontrada" }, { status: 404 });

    const stateRows = await runAsSuperAdmin((tx) => tx`
      select payload from public.app_state where id = 'main'
    `);
    const state = stateRows[0]?.payload || {};
    const key = `dc-${String(token).slice(0, 8)}`;
    const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const owner = String(demo.lead?.email || "").toLowerCase();
    const ownerEmail = emailPattern.test(owner) ? owner : `demo-${token}@fenloravisual.com`;

    const tenant = {
      id: key,
      name: demo.business_name,
      email: ownerEmail,
      niche: demo.payload?.meta?.niche || "Demo",
      plan: "crecimiento",
      country: "Colombia",
      city: "Bogotá",
      users: 1,
      status: "Prueba",
      mode: "Pool",
      mrr: 0,
      health: 80,
      color: demo.payload?.meta?.color || "#6366f1",
      created: new Date().toISOString().slice(0, 10),
      demoToken: token,
      seedData: demo.payload,
    };

    const tenants = Array.isArray(state.tenants) ? state.tenants : [];
    const next = { ...state, tenants: [tenant, ...tenants.filter((item) => item.id !== key)] };
    await runAsSuperAdmin((tx) => [
      tx`update public.app_state set payload = ${JSON.stringify(next)}::jsonb where id = 'main'`,
      ...buildSyncQueries(tx, next),
      tx`update public.demo_links
         set converted_tenant = ${key}, status = 'Convertida', updated_at = now()
         where token = ${String(token)}`,
    ]);

    return NextResponse.json({ ok: true, tenant: key, email: ownerEmail });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
