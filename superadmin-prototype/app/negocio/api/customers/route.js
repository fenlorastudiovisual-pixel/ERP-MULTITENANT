// Clientes del negocio. Lectura y alta con RLS del tenant.

import { NextResponse } from "next/server";
import { dbEnabled, runAsTenant } from "../../../../lib/db";
import { resolveBusinessContext } from "../../../../lib/tenant-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const asText = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }

  const params = new URL(request.url).searchParams;
  const q = asText(params.get("q")).slice(0, 100);
  const page = Math.max(1, Math.floor(number(params.get("page"), 1)));
  const limit = Math.min(100, Math.max(5, Math.floor(number(params.get("limit"), 20))));
  const tenantId = ctx.identity.tenant_id;

  try {
    const rows = await runAsTenant(tenantId, (tx) => tx`
      select c.id::text as id, c.name, c.document, c.email, c.phone, c.city, c.address,
             c.created_at,
             count(*) over () as total,
             (select count(*)::int from public.orders o
               where o.customer_id = c.id and o.tenant_id = ${tenantId}::uuid) as orders,
             (select coalesce(sum(o.total), 0)::float from public.orders o
               where o.customer_id = c.id and o.tenant_id = ${tenantId}::uuid) as spent
      from public.customers c
      where c.tenant_id = ${tenantId}::uuid
        and (${q} = '' or c.name ilike '%' || ${q} || '%'
             or coalesce(c.document, '') ilike '%' || ${q} || '%'
             or coalesce(c.email, '') ilike '%' || ${q} || '%')
      order by c.created_at desc, c.name asc
      limit ${limit}::int offset ${(page - 1) * limit}::int
    `, ctx.role, ctx.identity.user_id);

    const total = Number(rows[0]?.total || 0);
    return NextResponse.json({
      customers: rows.map(({ total: _ignored, ...row }) => row),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function POST(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }

  let body = null;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Datos inválidos" }, { status: 400 }); }

  const name = asText(body.name);
  const document = asText(body.document) || null;
  const email = asText(body.email).toLowerCase() || null;
  const phone = asText(body.phone) || null;
  const city = asText(body.city) || null;
  const address = asText(body.address) || null;
  if (!name) return NextResponse.json({ error: "El nombre del cliente es obligatorio" }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Escribe un correo válido" }, { status: 400 });
  }

  const tenantId = ctx.identity.tenant_id;
  try {
    const rows = await runAsTenant(tenantId, (tx) => tx`
      insert into public.customers (tenant_id, name, document, email, phone, city, address)
      values (${tenantId}::uuid, ${name}, ${document}, ${email}, ${phone}, ${city}, ${address})
      returning id::text, name, document, email, phone, city
    `, ctx.role, ctx.identity.user_id);
    return NextResponse.json({ customer: rows[0] }, { status: 201 });
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("customers_tenant_document_key")) {
      return NextResponse.json({ error: "Ya existe un cliente con ese documento" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
