// Demo pública: se abre solo con el token compartido.
// GET devuelve el sandbox y registra la visita. PUT guarda los cambios que el
// prospecto hace mientras explora (inventario, pedidos, estados...).

import { NextResponse } from "next/server";
import { dbEnabled, runAsSuperAdmin } from "../../../../lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function GET(request, { params }) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const { token } = await params;
  try {
    const rows = await runAsSuperAdmin((tx) => [
      tx`select token, niche_id, business_name, expires_at, visits, status, payload, lead,
                converted_tenant, created_at
          from public.demo_links where token = ${String(token)}`,
      tx`update public.demo_links set visits = visits + 1, updated_at = now()
          where token = ${String(token)}`,
    ]);
    const demo = rows[0][0];
    if (!demo) return NextResponse.json({ error: "Esta demo no existe o fue retirada" }, { status: 404 });
    return NextResponse.json({
      demo: { ...demo, visits: demo.visits + 1 },
      expired: new Date(demo.expires_at).getTime() < Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const { token } = await params;
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const payload = body?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  try {
    const rows = await runAsSuperAdmin((tx) => tx`
      update public.demo_links
      set payload = ${JSON.stringify(payload)}::jsonb, updated_at = now()
      where token = ${String(token)}
        and payload -> 'meta' ->> 'nicheId' = ${String(payload?.meta?.nicheId || "")}
      returning token
    `);
    if (!rows[0]) return NextResponse.json({ error: "No se pudo guardar la demo" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
