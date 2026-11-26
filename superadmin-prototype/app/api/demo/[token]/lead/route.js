// Captura del lead dentro de la demo pública. El esta visita se guarda en la demo.

import { NextResponse } from "next/server";
import { dbEnabled, runAsSuperAdmin } from "../../../../../lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request, { params }) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const { token } = await params;
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const name = String(body?.name || "").trim().slice(0, 80);
  const phone = String(body?.phone || "").trim().slice(0, 40);
  const email = String(body?.email || "").trim().toLowerCase().slice(0, 120);
  const company = String(body?.company || "").trim().slice(0, 80);
  const interest = String(body?.interest || "").trim().slice(0, 200);

  if (!name || !/^[+\d][\d\s()-]{6,}$/.test(phone)) {
    return NextResponse.json({ error: "Escribe tu nombre y un WhatsApp válido" }, { status: 400 });
  }

  const lead = {
    name, phone, email, company, interest,
    captured_at: new Date().toISOString(),
  };

  try {
    const rows = await runAsSuperAdmin((tx) => tx`
      update public.demo_links
      set lead = ${JSON.stringify(lead)}::jsonb,
          status = case when status = 'Convertida' then status else 'Con lead' end,
          visits = visits + 1,
          updated_at = now()
      where token = ${String(token)}
      returning token, business_name
    `);
    if (!rows[0]) return NextResponse.json({ error: "Demo no encontrada" }, { status: 404 });

    await runAsSuperAdmin((tx) => tx`
      insert into public.demo_leads (demo_id, name, email, company, phone, captured_at)
      select id, ${name}, ${email || `${phone}@sin-correo.com`}, ${company}, ${phone}, now()
      from public.demo_scenarios where source_key = ${String(token)} limit 1
    `).catch(() => []);

    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
