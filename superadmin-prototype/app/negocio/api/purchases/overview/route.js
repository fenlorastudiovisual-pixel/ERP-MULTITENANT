// Resumen de compras: proveedores, pedidos, recepciones y saldo con proveedores.

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
  if (!(await hasPermission(ctx, "purchase.view"))) {
    return NextResponse.json({ error: "No tienes permiso para ver compras." }, { status: 403 });
  }
  const tenantId = ctx.identity.tenant_id;
  try {
    const [suppliers, orders, receipts, orderLines, kpis] = await runAsTenant(tenantId, (tx) => [
      tx`
        select id::text as id, document, name, payment_terms_days, active
        from public.partners
        where tenant_id = ${tenantId}::uuid and kind in ('supplier', 'both') and active
        order by name
      `,
      tx`
        select o.id::text as id, o.number, o.status, o.created_at, o.expected_date,
               o.subtotal::float as subtotal, o.tax::float as tax, o.total::float as total,
               o.received_total::float as received_total,
               coalesce(p.name, 'Sin proveedor') as supplier, p.id::text as supplier_id,
               w.code as warehouse
        from public.purchase_orders o
        left join public.partners p on p.id = o.supplier_id
        left join public.warehouses w on w.id = o.warehouse_id
        where o.tenant_id = ${tenantId}::uuid
        order by o.created_at desc limit 60
      `,
      tx`
        select r.number, r.receipt_date, r.subtotal::float as subtotal, r.tax::float as tax,
               r.total::float as total, r.journal_number,
               coalesce(p.name, 'Sin proveedor') as supplier,
               o.number as purchase_order
        from public.purchase_receipts r
        left join public.partners p on p.id = r.supplier_id
        join public.purchase_orders o on o.id = r.purchase_order_id
        where r.tenant_id = ${tenantId}::uuid
        order by r.created_at desc limit 40
      `,
      tx`
        select pol.id::text as id, pol.order_id::text as order_id, pol.item_id::text as item_id,
               i.sku, i.name as item, pol.quantity::float as quantity,
               pol.received_qty::float as received_qty,
               pol.unit_cost::float as unit_cost, pol.total::float as total
        from public.purchase_order_lines pol
        join public.items i on i.id = pol.item_id
        where pol.tenant_id = ${tenantId}::uuid and pol.received_qty < pol.quantity
        order by pol.line_order limit 120
      `,
      tx`
        select
          (select coalesce(sum(total), 0) from public.purchase_orders
            where tenant_id = ${tenantId}::uuid and status in ('approved', 'partially_received'))::float as open_orders,
          (select coalesce(sum(total), 0) from public.purchase_receipts
            where tenant_id = ${tenantId}::uuid)::float as received,
          (select count(*)::int from public.purchase_orders
            where tenant_id = ${tenantId}::uuid and status = 'draft') as drafts,
          (select coalesce(sum(total_debit - total_credit), 0) from public.journal_lines jl
            join public.journal_entries je on je.id = jl.entry_id
            join public.accounts a on a.id = jl.account_id
            where je.tenant_id = ${tenantId}::uuid and jl.tenant_id = ${tenantId}::uuid
              and a.code = '2405')::float as payables
      `,
    ], ctx.identity.role, ctx.identity.user_id);
    return NextResponse.json({
      suppliers, orders, receipts, orderLines, kpis: kpis[0],
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
