// Centro de demos reales (Super Admin).
// POST crea una o varias demos con datos operativos completos por nicho.
// GET lista las demos creadas con visitas y lead capturado.

import { NextResponse } from "next/server";
import { dbEnabled, runAsSuperAdmin } from "../../../lib/db";
import { getSessionUser } from "../../../lib/auth";
import { buildDemoData, demoTemplates } from "../../../lib/demo-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "No autorizado. Inicia sesión como Super Admin." }, { status: 401 });
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  if (!(await getSessionUser(request))) return unauthorized();
  try {
    const rows = await runAsSuperAdmin((tx) => tx`
      select token, niche_id, business_name, expires_at, visits, status,
             lead, converted_tenant, created_at, updated_at,
             payload -> 'meta' ->> 'niche' as niche_name,
             payload -> 'meta' ->> 'icon' as icon,
             payload -> 'meta' ->> 'color' as color,
             payload -> 'meta' -> 'modules' as modules,
             jsonb_array_length(payload -> 'products') as products,
             jsonb_array_length(payload -> 'customers') as customers,
             jsonb_array_length(payload -> 'orders') as orders
      from public.demo_links order by created_at desc limit 100
    `);
    return NextResponse.json({ demos: rows, templates: demoTemplates() });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function POST(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(request))) return unauthorized();

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const days = Math.min(90, Math.max(1, Number(body?.days) || 14));
  const items = Array.isArray(body?.items) && body.items.length
    ? body.items.slice(0, 30)
    : [{ nicheId: body?.nicheId, businessName: body?.businessName }];

  const created = [];
  try {
    for (const item of items) {
      const nicheId = String(item?.nicheId || "d1");
      const businessName = String(item?.businessName || "Negocio demo").slice(0, 80);
      const payload = buildDemoData(nicheId, businessName, body?.seed || "");
      let inserted = null;
      for (let attempt = 0; attempt < 4 && !inserted; attempt++) {
        const value = token();
        const rows = await runAsSuperAdmin((tx) => tx`
          insert into public.demo_links
            (token, niche_id, business_name, created_by, expires_at, payload)
          values
            (${value}, ${nicheId}, ${businessName}, ${"superadmin"}::text,
             now() + (${days} || ' days')::interval, ${JSON.stringify(payload)}::jsonb)
          on conflict (token) do nothing
          returning token, niche_id, business_name, expires_at, created_at
        `);
        inserted = rows[0] || null;
      }
      if (inserted) created.push({ ...inserted, url: `/demo/${inserted.token}` });
    }
    return NextResponse.json({ ok: true, created });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
