// Detalle de un pedido del negocio y cambio de estado, siempre dentro del tenant.

import { NextResponse } from "next/server";
import { dbEnabled, runAsTenant } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
const asText = (value) => String(value ?? "").trim();

export async function GET(request, { params }) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }
  const { id } = await params;
  const tenantId = ctx.identity.tenant_id;

  try {
    const orders = await runAsTenant(tenantId, (tx) => tx`
      select o.id::text as id, o.number, o.status, o.subtotal::float as subtotal,
             o.tax::float as tax, o.total::float as total, o.notes, o.created_at,
             o.updated_at,
             coalesce(c.name, 'Cliente no identificado') as customer,
             coalesce(c.document, '') as document,
             coalesce(c.phone, '') as phone
      from public.orders o
      left join public.customers c on c.id = o.customer_id
      where o.tenant_id = ${tenantId}::uuid and o.id = ${asText(id)}::uuid
    `, ctx.role, ctx.identity.user_id);
    if (!orders.length) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

    const orderNumber = `Pedido ${orders[0].number}`;
    const [items, movements] = await runAsTenant(tenantId, (tx) => [
      tx`
        select i.quantity, i.unit_price::float as unit_price, i.total::float as total,
               p.name, p.sku, p.category
        from public.order_items i
        join public.products p on p.id = i.product_id
        where i.tenant_id = ${tenantId}::uuid and i.order_id = ${asText(id)}::uuid
        order by p.name
      `,
      tx`
        select quantity, kind, reason, created_at from public.stock_movements
        where tenant_id = ${tenantId}::uuid and reason = ${orderNumber}
        order by created_at desc
      `,
    ], ctx.role, ctx.identity.user_id);

    return NextResponse.json({ order: orders[0], items, movements });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }
  const { id } = await params;
  let body = null;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Datos inválidos" }, { status: 400 }); }
  const status = asText(body.status);
  if (!STATUSES.includes(status)) return NextResponse.json({ error: "Estado no válido" }, { status: 400 });

  const tenantId = ctx.identity.tenant_id;
  try {
    const rows = await runAsTenant(tenantId, (tx) => tx`
      update public.orders
      set status = ${status}, updated_at = now()
      where tenant_id = ${tenantId}::uuid and id = ${asText(id)}::uuid
      returning id::text, number, status, total::float
    `, ctx.role, ctx.identity.user_id);
    if (!rows.length) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    return NextResponse.json({ order: rows[0] });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
