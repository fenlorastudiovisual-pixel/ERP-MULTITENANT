// Catálogo canónico de-items del ERP con existencias por almacén.

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
  const q = String(new URL(request.url).searchParams.get("q") || "").trim().slice(0, 100);
  try {
    const items = await runAsTenant(tenantId, (tx) => tx`
      select i.id::text as id, i.sku, i.name, i.uom,
             i.sale_price::float as sale_price, i.cost_price::float as cost_price,
             coalesce((
               select sum(v.quantity) from public.inventory_valuation v
               where v.tenant_id = ${tenantId}::uuid and v.item_id = i.id
             ), 0)::float as stock
      from public.items i
      where i.tenant_id = ${tenantId}::uuid and i.active
        and (${q} = '' or i.name ilike '%' || ${q} || '%' or i.sku ilike '%' || ${q} || '%')
      order by i.name limit 80
    `, ctx.identity.role, ctx.identity.user_id);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
