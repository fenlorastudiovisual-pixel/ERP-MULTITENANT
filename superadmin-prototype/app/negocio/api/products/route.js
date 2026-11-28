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
  const brand = asText(params.get("brand")).slice(0, 80);
  const page = Math.max(1, Math.floor(number(params.get("page"), 1)));
  const limit = Math.min(100, Math.max(5, Math.floor(number(params.get("limit"), 20))));
  const tenantId = ctx.identity.tenant_id;

  try {
    const [rows, categories, brands] = await runAsTenant(tenantId, (tx) => [
      tx`
        select p.id::text as id, p.sku, p.name, p.description, p.category, p.brand,
               p.price::float as price, p.cost::float as cost, p.unit,
               p.stock, p.min_stock, p.active, p.created_at,
               count(*) over () as total
        from public.products p
        where p.tenant_id = ${tenantId}::uuid
          and (${q} = '' or p.name ilike '%' || ${q} || '%' or p.sku ilike '%' || ${q} || '%')
          and (${brand} = '' or p.brand = ${brand})
          and (${category} = '' or p.category = ${category})
        order by p.created_at desc, p.name asc
        limit ${limit}::int offset ${(page - 1) * limit}::int
      `,
      tx`
        select category, count(*)::int as total from public.products
        where tenant_id = ${tenantId}::uuid and active
          and (${brand} = '' or brand = ${brand})
        group by category order by category
      `,
      tx`
        select brand, count(*)::int as total from public.products
        where tenant_id = ${tenantId}::uuid and active
        group by brand order by total desc, brand
      `,
    ], ctx.role, ctx.identity.user_id);

    const total = Number(rows[0]?.total || 0);
    return NextResponse.json({
      products: rows.map(({ total: _ignored, ...row }) => row),
      categories,
      brands,
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
  const brand = asText(body.brand) || "General";
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
      with p as (
        insert into public.products
          (tenant_id, sku, name, description, category, brand, price, cost, stock, min_stock, unit)
        values
          (${tenantId}::uuid, ${sku}, ${name}, ${description}, ${category}, ${brand},
           ${price}, ${cost}, ${stock}::int, ${minStock}::int, ${unit})
        returning *
      ),
      item as (
        insert into public.items
          (id, tenant_id, sku, name, description, category, brand, uom, sale_price, cost_price, tax_rate)
        select md5(p.id::text || ':item:' || ${tenantId}::text)::uuid, ${tenantId}::uuid,
               p.sku, p.name, p.description, p.category, p.brand, p.unit, p.price, p.cost, 0.19
        from p
        returning id, tenant_id
      ),
      balances as (
        insert into public.stock_balances
          (tenant_id, warehouse_id, item_id, quantity, reserved, average_cost, last_cost)
        select ${tenantId}::uuid, w.id, item.id,
               case when w.code = 'PRINCIPAL' then p.stock else 0 end, 0, p.cost, p.cost
        from item cross join p
        cross join public.warehouses w
        where w.tenant_id = ${tenantId}::uuid
        on conflict (tenant_id, warehouse_id, item_id) do nothing
        returning item_id
      ),
      layers as (
        insert into public.inventory_cost_layers
          (tenant_id, item_id, warehouse_id, quantity, remaining_qty, unit_cost)
        select ${tenantId}::uuid, item.id, md5('principal:' || ${tenantId}::text)::uuid,
               p.stock, p.stock, p.cost
        from item cross join p
        where p.stock > 0
        returning id
      )
      select p.id::text, p.sku, p.name, p.category, p.price::float, p.stock,
             p.min_stock, p.active
      from p
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
          returning id, cost
        ),
        item as (
          select id, cost_price from public.items
          where tenant_id = ${tenantId}::uuid
            and id = md5(${id}::text || ':item:' || ${tenantId}::text)::uuid
        ),
        guard_item as (
          select case when exists (select 1 from item) then 1 else 1 / 0 end as ok
        ),
        seq as (
          insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
          values (${tenantId}::uuid, 'inventory_movement', 'IM', ${String(new Date().getUTCFullYear())}, 2)
          on conflict (tenant_id, doc_type, prefix, period)
          do update set next_value = public.sequences.next_value + 1, updated_at = now()
          returning next_value - 1 as num
        ),
        sb as (
          update public.stock_balances sb
          set quantity = sb.quantity + ${delta},
              average_cost = case
                when ${delta} > 0 and sb.quantity + ${delta} > 0
                then round((sb.quantity * sb.average_cost + ${delta} * item.cost_price)
                           / (sb.quantity + ${delta}), 2)
                else sb.average_cost end,
              last_cost = case when ${delta} > 0 then item.cost_price else sb.last_cost end,
              updated_at = now()
          from item
          where sb.tenant_id = ${tenantId}::uuid
            and sb.warehouse_id = md5('principal:' || ${tenantId}::text)::uuid
            and sb.item_id = item.id
          returning sb.quantity, sb.average_cost
        ),
        inv_mov as (
          insert into public.inventory_movements
            (id, tenant_id, number, movement_type, item_id, to_warehouse_id, quantity,
             unit_cost, total_cost, balance_after, reason, reference_type, created_by)
          select gen_random_uuid(), ${tenantId}::uuid,
                 'IM-' || lpad(seq.num::text, 6, '0'), 'adjustment', item.id,
                 md5('principal:' || ${tenantId}::text)::uuid,
                 abs(${delta}), item.cost_price, abs(${delta} * item.cost_price),
                 sb.quantity, ${reason}, 'adjustment', ${ctx.identity.user_id || null}::uuid
          from seq cross join item cross join sb
          returning id
        ),
        layer_in as (
          insert into public.inventory_cost_layers
            (tenant_id, item_id, warehouse_id, movement_id, quantity, remaining_qty, unit_cost)
          select ${tenantId}::uuid, item.id, md5('principal:' || ${tenantId}::text)::uuid,
                 (select id from inv_mov), ${delta}, ${delta}, item.cost_price
          from item where ${delta} > 0
          returning id
        ),
        layers_src as (
          select id, remaining_qty, received_at, created_at
          from public.inventory_cost_layers
          where ${delta} < 0 and tenant_id = ${tenantId}::uuid
            and warehouse_id = md5('principal:' || ${tenantId}::text)::uuid
            and item_id = (select id from item) and remaining_qty > 0
          for update
        ),
        ranked as (
          select id, remaining_qty, received_at,
                 coalesce(sum(remaining_qty) over (
                   order by received_at, created_at
                   rows between unbounded preceding and 1 preceding
                 ), 0) as prev_qty
          from layers_src
        ),
        take as (
          select id, least(remaining_qty, abs(${delta}) - prev_qty) as take_qty
          from ranked where prev_qty < abs(${delta})
        ),
        consume as (
          update public.inventory_cost_layers l
          set remaining_qty = l.remaining_qty - t.take_qty,
              consumed_qty = l.consumed_qty + t.take_qty, updated_at = now()
          from take t where l.id = t.id
          returning l.id
        ),
        guard_layers as (
          select case when ${delta} > 0 or coalesce((select sum(take_qty) from take), 0) >= abs(${delta})
                      then 1 else 1 / 0 end as ok
        ),
        legacy_mov as (
          insert into public.stock_movements (tenant_id, product_id, quantity, kind, reason)
          select ${tenantId}::uuid, id, ${delta}::int, 'adjustment', ${reason}
          from moved cross join guard_item cross join guard_layers
          returning product_id::text as id, quantity, kind, reason
        )
        select id, quantity, kind, reason from legacy_mov
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

    if (body.action === "price") {
      const price = number(body.price, -1);
      if (!Number.isFinite(price) || price <= 0 || price > 1000000000) {
        return NextResponse.json({ error: "Escribe un precio válido entre 1 y 1.000.000.000" }, { status: 400 });
      }
      const rows = await runAsTenant(tenantId, (tx) => tx`
        with prod as (
          select id, sku, name, price as old_price
          from public.products
          where tenant_id = ${tenantId}::uuid and id = ${id}::uuid
        ),
        map as (
          select source_table, source_row_id, source_sku, column_name
          from public.samjuro_item_map
          where tenant_id = ${tenantId}::uuid and item_id = ${id}::uuid
        ),
        updated_product as (
          update public.products set price = ${price}, updated_at = now()
          where tenant_id = ${tenantId}::uuid and id = ${id}::uuid
          returning id
        ),
        updated_item as (
          update public.items set sale_price = ${price}, updated_at = now()
          where tenant_id = ${tenantId}::uuid and id = ${id}::uuid
          returning id
        ),
        pending as (
          insert into public.samjuro_price_sync
            (tenant_id, item_id, sku, source_table, source_row_id, column_name,
             old_price, new_price, requested_by)
          select ${tenantId}::uuid, prod.id,
                 coalesce(nullif(map.source_sku, ''), prod.sku),
                 map.source_table, map.source_row_id, map.column_name,
                 prod.old_price, ${price}, ${ctx.identity.user_id || null}::uuid
          from prod
          join map on map.source_table is not null and map.source_row_id is not null
          on conflict (tenant_id, item_id, source_row_id) do update set
            sku = excluded.sku,
            source_table = excluded.source_table,
            column_name = excluded.column_name,
            old_price = excluded.old_price,
            new_price = excluded.new_price,
            status = 'pending',
            attempts = 0,
            last_error = null,
            created_at = now(),
            synced_at = null,
            requested_by = excluded.requested_by
          returning id
        )
        select prod.id::text as id, prod.sku, prod.name,
               ${price}::float as price, prod.old_price::float as old_price,
               (select count(*)::int from pending) as pending_sync
        from prod
      `, ctx.role, ctx.identity.user_id);
      if (!rows.length) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
      return NextResponse.json({ product: rows[0] });
    }

    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
