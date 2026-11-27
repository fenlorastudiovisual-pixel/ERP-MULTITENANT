// Resumen financiero del ERP: una sola contabilidad, mismos datos para todos los módulos.

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
  if (!(await hasPermission(ctx, "finance.view"))) {
    return NextResponse.json({ error: "No tienes permiso para ver finanzas." }, { status: 403 });
  }

  const tenantId = ctx.identity.tenant_id;
  try {
    const [kpis, monthly, aging, invoices, journal, orders] = await runAsTenant(tenantId, (tx) => [
      tx`
        select
          (select coalesce(sum(total), 0)::float from public.invoices_ops
             where tenant_id = ${tenantId}::uuid and status <> 'draft') as invoiced,
          (select coalesce(sum(amount), 0)::float from public.payments_in
             where tenant_id = ${tenantId}::uuid) as collected,
          (select coalesce(sum(balance), 0)::float from public.receivables
             where tenant_id = ${tenantId}::uuid) as receivable,
          (select count(*)::int from public.invoices_ops
             where tenant_id = ${tenantId}::uuid and balance > 0) as open_invoices,
          (select coalesce(sum(total_debit), 0)::float from public.journal_entries
             where tenant_id = ${tenantId}::uuid) as posted,
          (select count(*)::int from public.sales_orders
             where tenant_id = ${tenantId}::uuid and status in ('confirmed', 'delivered')) as invoiceable
      `,
      tx`
        select to_char(m, 'YYYY-MM') as month,
               coalesce((select sum(i.total) from public.invoices_ops i
                  where i.tenant_id = ${tenantId}::uuid
                    and date_trunc('month', i.issue_date) = m), 0)::float as invoiced,
               coalesce((select sum(p.amount) from public.payments_in p
                  where p.tenant_id = ${tenantId}::uuid
                    and date_trunc('month', p.payment_date) = m), 0)::float as collected
        from generate_series(date_trunc('month', now()) - interval '5 months',
                             date_trunc('month', now()), interval '1 month') m
        group by m order by m
      `,
      tx`
        select case
                 when due_date < current_date - interval '90 days' then '90+'
                 when due_date < current_date - interval '60 days' then '61-90'
                 when due_date < current_date - interval '30 days' then '31-60'
                 when due_date < current_date then '1-30'
                 else 'corriente' end as bucket,
               count(*)::int as invoices,
               coalesce(sum(balance), 0)::float as amount
        from public.receivables
        where tenant_id = ${tenantId}::uuid and balance > 0
        group by 1 order by 1
      `,
      tx`
        select i.id::text as id, i.number, p.name as partner, i.issue_date,
               i.total::float as total, i.balance::float as balance, i.status
        from public.invoices_ops i
        left join public.partners p on p.id = i.partner_id
        where i.tenant_id = ${tenantId}::uuid
        order by i.created_at desc limit 12
      `,
      tx`
        select id::text as id, number, entry_date, description,
               total_debit::float as total_debit, status
        from public.journal_entries
        where tenant_id = ${tenantId}::uuid
        order by created_at desc limit 12
      `,
      tx`
        select o.id::text as id, o.number, p.name as partner, o.total::float as total, o.status
        from public.sales_orders o
        left join public.partners p on p.id = o.partner_id
        where o.tenant_id = ${tenantId}::uuid and o.status in ('confirmed', 'delivered')
        order by o.created_at desc limit 12
      `,
    ], ctx.identity.role, ctx.identity.user_id);

    return NextResponse.json({
      kpis: kpis[0] || null,
      monthly,
      aging,
      invoices,
      journal,
      invoiceableOrders: orders,
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
