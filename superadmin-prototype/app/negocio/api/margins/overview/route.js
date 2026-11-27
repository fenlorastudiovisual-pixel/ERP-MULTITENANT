// Utilidades: precio final al cliente (IVA incluido) vs costo de proveedor.
// El IVA no es utilidad: el margen se calcula siempre sobre el precio sin IVA.
// Solo lectura; respeta RLS y el permiso finance.view del tenant.

import { NextResponse } from "next/server";
import { dbEnabled, runAsTenant } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { hasPermission } from "../../../../../lib/erp/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const number = (value) => Number(value || 0);
const pct = (profit, net) => (net > 0 ? (profit / net) * 100 : 0);

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }
  if (!(await hasPermission(ctx, "finance.view"))) {
    return NextResponse.json({ error: "No tienes permiso para ver las utilidades." }, { status: 403 });
  }
  const tenantId = ctx.identity.tenant_id;
  try {
    const [settings, totals, byItem, byOrder] = await runAsTenant(tenantId, (tx) => [
      tx`
        select coalesce(nullif(settings->>'iva_rate', '')::numeric, 19)::float as iva_rate
        from public.tenants where id = ${tenantId}::uuid
      `,
      tx`
        select
          coalesce(sum(sol.total), 0)::float as sales_gross,
          coalesce(sum(sol.total / (1 + coalesce(i.tax_rate, 0.19))), 0)::float as sales_net,
          coalesce(sum(sol.quantity * coalesce(sol.cost_unit, i.cost_price, 0)), 0)::float as cogs,
          coalesce(sum(sol.quantity), 0)::float as units,
          count(distinct so.id)::int as orders
        from public.sales_order_lines sol
        join public.sales_orders so on so.id = sol.order_id and so.tenant_id = sol.tenant_id
        left join public.items i on i.id = sol.item_id and i.tenant_id = sol.tenant_id
        where sol.tenant_id = ${tenantId}::uuid and so.status <> 'cancelled'
      `,
      tx`
        select i.sku, i.name as item, i.category,
          coalesce(i.sale_price, 0)::float as sale_price,
          coalesce(i.cost_price, 0)::float as cost_price,
          coalesce(i.tax_rate, 0.19)::float as tax_rate,
          coalesce(max(v.last_cost), i.cost_price, 0)::float as last_cost,
          coalesce(avg(v.average_cost), i.cost_price, 0)::float as average_cost,
          coalesce(sum(case when so.status <> 'cancelled' then sol.quantity else 0 end), 0)::float as units_sold,
          coalesce(sum(case when so.status <> 'cancelled' then sol.total else 0 end), 0)::float as sales_gross,
          coalesce(sum(case when so.status <> 'cancelled'
            then sol.total / (1 + coalesce(i.tax_rate, 0.19)) else 0 end), 0)::float as sales_net,
          coalesce(sum(case when so.status <> 'cancelled'
            then sol.quantity * coalesce(sol.cost_unit, i.cost_price, 0) else 0 end), 0)::float as cogs
        from public.items i
        left join public.sales_order_lines sol on sol.item_id = i.id and sol.tenant_id = i.tenant_id
        left join public.sales_orders so on so.id = sol.order_id and so.tenant_id = i.tenant_id
        left join public.inventory_valuation v on v.item_id = i.id and v.tenant_id = i.tenant_id
        where i.tenant_id = ${tenantId}::uuid and i.active
        group by i.id, i.sku, i.name, i.category, i.sale_price, i.cost_price, i.tax_rate
        order by sales_gross desc, i.name limit 40
      `,
      tx`
        select so.number, so.created_at, coalesce(p.name, 'Sin cliente') as customer,
          coalesce(sum(sol.total), 0)::float as gross,
          coalesce(sum(sol.total / (1 + coalesce(i.tax_rate, 0.19))), 0)::float as net,
          coalesce(sum(sol.quantity * coalesce(sol.cost_unit, i.cost_price, 0)), 0)::float as cogs,
          coalesce(sum(sol.quantity), 0)::float as units
        from public.sales_orders so
        left join public.partners p on p.id = so.partner_id and p.tenant_id = so.tenant_id
        left join public.sales_order_lines sol on sol.order_id = so.id and sol.tenant_id = so.tenant_id
        left join public.items i on i.id = sol.item_id and i.tenant_id = so.tenant_id
        where so.tenant_id = ${tenantId}::uuid and so.status <> 'cancelled'
        group by so.id, so.number, so.created_at, p.name
        order by so.created_at desc limit 30
      `,
    ], ctx.identity.role, ctx.identity.user_id);

    const t = totals[0] || {};
    const salesGross = number(t.sales_gross);
    const salesNet = number(t.sales_net);
    const cogs = number(t.cogs);
    const grossProfit = salesNet - cogs;

    return NextResponse.json({
      ivaRate: number(settings[0]?.iva_rate),
      kpis: {
        salesGross,
        salesNet,
        iva: salesGross - salesNet,
        cogs,
        grossProfit,
        marginPct: pct(grossProfit, salesNet),
        orders: number(t.orders),
        units: number(t.units),
      },
      byItem: (byItem || []).map((row) => {
        const net = number(row.sales_net);
        const cost = number(row.cogs);
        const profit = net - cost;
        return {
          ...row,
          unitNet: number(row.sale_price) / (1 + number(row.tax_rate)),
          profit,
          marginPct: pct(profit, net),
        };
      }),
      byOrder: (byOrder || []).map((row) => ({
        ...row,
        profit: number(row.net) - number(row.cogs),
        marginPct: pct(number(row.net) - number(row.cogs), number(row.net)),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
