// Catálogo de productos del negocio. Lectura y escritura con RLS del tenant.

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
  const category = asText(params.get("category")).slice(0, 80);
  const page = Math.max(1, Math.floor(number(params.get("page"), 1)));
  const limit = Math.min(100, Math.max(5, Math.floor(number(params.get("limit"), 20))));
  const tenantId = ctx.identity.tenant_id;

  try {
    const [rows, categories] = await runAsTenant(tenantId, (tx) => [
      tx`
        select p.id::text as id, p.sku, p.name, p.description, p.category,
               p.price::float as price, p.cost::float as cost, p.unit,
               p.stock, p.min_stock, p.active, p.created_at,
               count(*) over () as total
        from public.products p
        where p.tenant_id = ${tenantId}::uuid
          and (${q} = '' or p.name ilike '%' || ${q} || '%' or p.sku ilike '%' || ${q} || '%')
          and (${category} = '' or p.category = ${category})
        order by p.created_at desc, p.name asc
        limit ${limit}::int offset ${(page - 1) * limit}::int
      `,
      tx`
        select category, count(*)::int as total from public.products
        where tenant_id = ${tenantId}::uuid and active
        group by category order by category
      `,
    ], ctx.role, ctx.identity.user_id);

    const total = Number(rows[0]?.total || 0);
    return NextResponse.json({
      products: rows.map(({ total: _ignored, ...row }) => row),
      categories,
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

  const sku = asText(body.sku).toUpperCase();
  const name = asText(body.name);
  const category = asText(body.category) || "General";
  const price = number(body.price, -1);
  const cost = number(body.cost, 0);
  const stock = number(body.stock, 0);
  const minStock = number(body.min_stock, 0);
  const unit = asText(body.unit) || "und";
  const description = asText(body.description) || null;

  if (!sku || !name) return NextResponse.json({ error: "SKU y nombre son obligatorios" }, { status: 400 });
  if (price < 0 || cost < 0) return NextResponse.json({ error: "Precio y costo no pueden ser negativos" }, { status: 400 });
  if (!Number.isInteger(stock) || !Number.isInteger(minStock) || stock < 0 || minStock < 0) {
    return NextResponse.json({ error: "Stock y stock mínimo deben ser enteros positivos" }, { status: 400 });
  }

  const tenantId = ctx.identity.tenant_id;
  try {
    const rows = await runAsTenant(tenantId, (tx) => tx`
      insert into public.products
        (tenant_id, sku, name, description, category, price, cost, stock, min_stock, unit)
      values
        (${tenantId}::uuid, ${sku}, ${name}, ${description}, ${category},
         ${price}, ${cost}, ${stock}::int, ${minStock}::int, ${unit})
      returning id::text, sku, name, category, price::float, stock, min_stock, active
    `, ctx.role, ctx.identity.user_id);
    return NextResponse.json({ product: rows[0] }, { status: 201 });
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("products_tenant_sku_key")) {
      return NextResponse.json({ error: "Ya existe un producto con ese SKU" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }

  let body = null;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Datos inválidos" }, { status: 400 }); }
  const id = asText(body.id);
  const tenantId = ctx.identity.tenant_id;
  if (!id) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });

  try {
    if (body.action === "stock") {
      const delta = number(body.delta);
      if (!Number.isInteger(delta) || delta === 0) {
        return NextResponse.json({ error: "Escribe un ajuste entero distinto de cero" }, { status: 400 });
      }
      const reason = asText(body.reason).slice(0, 160) || "Ajuste manual de inventario";
      const rows = await runAsTenant(tenantId, (tx) => tx`
        with moved as (
          update public.products
          set stock = stock + ${delta}::int, updated_at = now()
          where tenant_id = ${tenantId}::uuid and id = ${id}::uuid
            and stock + ${delta}::int >= 0
          returning id
        )
        insert into public.stock_movements (tenant_id, product_id, quantity, kind, reason)
        select ${tenantId}::uuid, id, ${delta}::int, 'adjustment', ${reason} from moved
        returning product_id::text as id, quantity, kind, reason
      `, ctx.role, ctx.identity.user_id);
      if (!rows.length) return NextResponse.json({ error: "Producto no encontrado o stock insuficiente" }, { status: 400 });
      return NextResponse.json({ movement: rows[0] });
    }

    if (body.action === "toggle") {
      const rows = await runAsTenant(tenantId, (tx) => tx`
        update public.products set active = not active, updated_at = now()
        where tenant_id = ${tenantId}::uuid and id = ${id}::uuid
        returning id::text, active
      `, ctx.role, ctx.identity.user_id);
      if (!rows.length) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
      return NextResponse.json({ product: rows[0] });
    }

    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
