// Resumen operativo del negocio. Todo se lee con el contexto RLS del tenant.

import { NextResponse } from "next/server";
import { dbEnabled, runAsTenant } from "../../../../lib/db";
import { resolveBusinessContext } from "../../../../lib/tenant-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }

  const tenantId = ctx.identity.tenant_id;
  try {
    const [
      kpis, sales, statuses, topProducts, recentOrders, lowStock, categories, invoices,
    ] = await runAsTenant(tenantId, (tx) => [
      tx`
        select
          (select count(*)::int from public.products where tenant_id = ${tenantId}::uuid and active) as products,
          (select count(*)::int from public.customers where tenant_id = ${tenantId}::uuid) as customers,
          (select count(*)::int from public.orders where tenant_id = ${tenantId}::uuid) as orders,
          (select coalesce(sum(total), 0)::float from public.orders
             where tenant_id = ${tenantId}::uuid and status <> 'cancelled') as sales,
          (select count(*)::int from public.products
             where tenant_id = ${tenantId}::uuid and active and stock <= min_stock) as low_stock,
          (select coalesce(sum(stock * cost), 0)::float from public.products
             where tenant_id = ${tenantId}::uuid and active) as inventory_value,
          (select count(*)::int from public.orders
             where tenant_id = ${tenantId}::uuid and status = 'pending') as pending,
          (select count(*)::int from public.orders
             where tenant_id = ${tenantId}::uuid and status = 'delivered') as delivered
      `,
      tx`
        select to_char(month, 'YYYY-MM') as month, coalesce(sum(o.total), 0)::float as total
        from generate_series(
          date_trunc('month', now()) - interval '5 months',
          date_trunc('month', now()),
          interval '1 month'
        ) as month
        left join public.orders o
          on o.tenant_id = ${tenantId}::uuid
         and date_trunc('month', o.created_at) = month
         and o.status <> 'cancelled'
        group by month order by month
      `,
      tx`
        select status, count(*)::int as total, coalesce(sum(total), 0)::float as amount
        from public.orders where tenant_id = ${tenantId}::uuid
        group by status order by total desc
      `,
      tx`
        select p.name, p.sku, p.category,
               coalesce(sum(oi.quantity), 0)::int as units,
               coalesce(sum(oi.total), 0)::float as revenue
        from public.order_items oi
        join public.products p on p.id = oi.product_id
        where oi.tenant_id = ${tenantId}::uuid
        group by p.id, p.name, p.sku, p.category
        order by revenue desc limit 8
      `,
      tx`
        select o.id::text as id, o.number, o.status, o.total::float as total, o.created_at,
               coalesce(c.name, 'Cliente no identificado') as customer
        from public.orders o
        left join public.customers c on c.id = o.customer_id
        where o.tenant_id = ${tenantId}::uuid
        order by o.created_at desc limit 6
      `,
      tx`
        select sku, name, category, stock, min_stock from public.products
        where tenant_id = ${tenantId}::uuid and active and stock <= min_stock
        order by stock asc limit 8
      `,
      tx`
        select category, count(*)::int as products, coalesce(sum(stock), 0)::int as units
        from public.products where tenant_id = ${tenantId}::uuid and active
        group by category order by products desc
      `,
      tx`
        select number, amount::float as amount, currency, status, issued_at
        from public.invoices where tenant_id = ${tenantId}::uuid
        order by issued_at desc limit 6
      `,
    ], ctx.role, ctx.identity.user_id);

    return NextResponse.json({
      kpis: kpis[0] || null,
      sales: sales,
      statuses: statuses,
      topProducts: topProducts,
      recentOrders: recentOrders,
      lowStock: lowStock,
      categories: categories,
      invoices: invoices,
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
