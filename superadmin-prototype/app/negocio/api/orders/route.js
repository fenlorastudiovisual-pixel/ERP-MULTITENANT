// Pedidos del negocio. El precio se toma siempre del catálogo de Neon,
// nunca del cliente, y cada pedido descuenta stock con su movimiento.

import { randomUUID } from "node:crypto";
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
  const status = asText(params.get("status")).slice(0, 30);
  const page = Math.max(1, Math.floor(number(params.get("page"), 1)));
  const limit = Math.min(100, Math.max(5, Math.floor(number(params.get("limit"), 20))));
  const tenantId = ctx.identity.tenant_id;

  try {
    const rows = await runAsTenant(tenantId, (tx) => tx`
      select o.id::text as id, o.number, o.status, o.subtotal::float as subtotal,
             o.tax::float as tax, o.total::float as total, o.notes, o.created_at,
             coalesce(c.name, 'Cliente no identificado') as customer,
             (select count(*)::int from public.order_items i where i.order_id = o.id) as items,
             count(*) over () as total_rows
      from public.orders o
      left join public.customers c on c.id = o.customer_id
      where o.tenant_id = ${tenantId}::uuid
        and (${q} = '' or o.number ilike '%' || ${q} || '%' or coalesce(c.name, '') ilike '%' || ${q} || '%')
        and (${status} = '' or o.status = ${status})
      order by o.created_at desc, o.number desc
      limit ${limit}::int offset ${(page - 1) * limit}::int
    `, ctx.role, ctx.identity.user_id);

    const total = Number(rows[0]?.total_rows || 0);
    return NextResponse.json({
      orders: rows.map(({ total_rows: _ignored, ...row }) => row),
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

  const customerId = asText(body.customer_id);
  const notes = asText(body.notes).slice(0, 300) || null;
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.map((item) => ({
    productId: asText(item.product_id),
    quantity: Math.floor(number(item.quantity)),
  }));

  if (!customerId) return NextResponse.json({ error: "Selecciona un cliente" }, { status: 400 });
  if (!items.length) return NextResponse.json({ error: "Agrega al menos un producto" }, { status: 400 });
  if (items.some((item) => !item.productId || item.quantity < 1)) {
    return NextResponse.json({ error: "Revisa los productos y las cantidades" }, { status: 400 });
  }

  const tenantId = ctx.identity.tenant_id;
  try {
    // Precio y stock vigentes se leen del catálogo, no del navegador.
    const [customers, products, counters] = await runAsTenant(tenantId, (tx) => [
      tx`select id::text as id, name from public.customers
          where tenant_id = ${tenantId}::uuid and id = ${customerId}::uuid`,
      tx`select id::text as id, name, sku, price::float as price, stock::int as stock
          from public.products
          where tenant_id = ${tenantId}::uuid and active
            and id in (
              select x.id::uuid from jsonb_to_recordset(${JSON.stringify(items.map((i) => ({ id: i.productId })))}::jsonb)
              as x(id text)
            )`,
      tx`select 'PED-' || to_char(now(), 'YYYY') || '-' ||
                lpad((count(*) + 1)::text, 5, '0') as number
          from public.orders where tenant_id = ${tenantId}::uuid`,
    ], ctx.role, ctx.identity.user_id);

    if (!customers.length) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 400 });

    const byId = new Map(products.map((product) => [product.id, product]));
    const priced = items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new Error(`Producto no disponible: ${item.productId}`);
      if (item.quantity > product.stock) {
        throw new Error(`Stock insuficiente para ${product.name} (hay ${product.stock})`);
      }
      return { ...product, quantity: item.quantity, total: Math.round(product.price * item.quantity * 100) / 100 };
    });

    const subtotal = Math.round(priced.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
    const tax = Math.round(subtotal * 0.19 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;
    const orderId = randomUUID();
    const orderNumber = counters[0]?.number || `PED-${new Date().getFullYear()}-${orderId.slice(0, 5).toUpperCase()}`;

    const itemRows = priced.map((item) => ({
      order_id: orderId,
      product_id: item.id,
      quantity: item.quantity,
      unit_price: item.price,
      total: item.total,
    }));
    const movementRows = priced.map((item) => ({
      product_id: item.id,
      quantity: -item.quantity,
      reason: `Pedido ${orderNumber}`,
    }));
    const stockRows = priced.map((item) => ({ id: item.id, quantity: item.quantity }));
    const json = (value) => JSON.stringify(value);

    await runAsTenant(tenantId, (tx) => [
      tx`
        insert into public.orders
          (id, tenant_id, number, customer_id, status, subtotal, tax, total, notes)
        values
          (${orderId}::uuid, ${tenantId}::uuid, ${orderNumber}, ${customerId}::uuid,
           'confirmed', ${subtotal}, ${tax}, ${total}, ${notes})
      `,
      tx`
        insert into public.order_items (tenant_id, order_id, product_id, quantity, unit_price, total)
        select ${tenantId}::uuid, x.order_id::uuid, x.product_id::uuid,
               x.quantity::int, x.unit_price::numeric, x.total::numeric
        from jsonb_to_recordset(${json(itemRows)}::jsonb) as x(
          order_id text, product_id text, quantity text, unit_price text, total text
        )
      `,
      tx`
        insert into public.stock_movements (tenant_id, product_id, quantity, kind, reason)
        select ${tenantId}::uuid, x.product_id::uuid, x.quantity::int, 'out', x.reason
        from jsonb_to_recordset(${json(movementRows)}::jsonb) as x(
          product_id text, quantity text, reason text
        )
      `,
      tx`
        update public.products p
        set stock = p.stock - x.quantity::int, updated_at = now()
        from jsonb_to_recordset(${json(stockRows)}::jsonb) as x(id text, quantity text)
        where p.tenant_id = ${tenantId}::uuid and p.id = x.id::uuid
      `,
    ], ctx.role, ctx.identity.user_id);

    return NextResponse.json({
      order: {
        id: orderId, number: orderNumber, status: "confirmed",
        subtotal, tax, total, items: priced.length, customer: customers[0].name,
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 409 });
  }
}
