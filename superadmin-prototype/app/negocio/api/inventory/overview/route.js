// Resumen de inventario multi-almacén: existencias, valoración y movimientos.

import { NextResponse } from "next/server";
import { dbEnabled, runAsTenant } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { hasPermission } from "../../../../../lib/erp/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }
  if (!(await hasPermission(ctx, "inventory.view"))) {
    return NextResponse.json({ error: "No tienes permiso para ver el inventario." }, { status: 403 });
  }
  const tenantId = ctx.identity.tenant_id;
  try {
    const [warehouses, valuation, movements, counts, kpis] = await runAsTenant(tenantId, (tx) => [
      tx`
        select id::text as id, code, name, cost_center, active
        from public.warehouses where tenant_id = ${tenantId}::uuid order by code
      `,
      tx`
        select w.code as warehouse, w.name as warehouse_name, i.sku, i.name as item,
               v.quantity::float as quantity, v.average_cost::float as average_cost,
               v.average_value::float as average_value, v.fifo_value::float as fifo_value,
               v.last_cost::float as last_cost
        from public.inventory_valuation v
        join public.warehouses w on w.id = v.warehouse_id
        join public.items i on i.id = v.item_id
        where v.tenant_id = ${tenantId}::uuid and v.quantity > 0
        order by w.code, i.name limit 60
      `,
      tx`
        select m.number, m.movement_type, m.quantity::float as quantity,
               m.unit_cost::float as unit_cost, m.reason, m.occurred_at,
               w_from.code as from_code, w_to.code as to_code, i.sku, i.name as item
        from public.inventory_movements m
        left join public.warehouses w_from on w_from.id = m.from_warehouse_id
        left join public.warehouses w_to on w_to.id = m.to_warehouse_id
        join public.items i on i.id = m.item_id
        where m.tenant_id = ${tenantId}::uuid
        order by m.occurred_at desc limit 50
      `,
      tx`
        select c.number, c.counted_at, c.difference_total::float as difference_total,
               c.reason, c.journal_number, w.code as warehouse
        from public.inventory_counts c
        join public.warehouses w on w.id = c.warehouse_id
        where c.tenant_id = ${tenantId}::uuid
        order by c.counted_at desc limit 20
      `,
      tx`
        select
          coalesce(sum(quantity), 0)::float as units,
          coalesce(sum(average_value), 0)::float as average_value,
          coalesce(sum(fifo_value), 0)::float as fifo_value,
          count(*) filter (where quantity > 0)::int as stocked_items,
          count(*) filter (where quantity = 0)::int as empty_locations
        from public.inventory_valuation where tenant_id = ${tenantId}::uuid
      `,
    ], ctx.identity.role, ctx.identity.user_id);
    return NextResponse.json({ warehouses, valuation, movements, counts, kpis: kpis[0] });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
