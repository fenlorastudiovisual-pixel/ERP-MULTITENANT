// Facturación operativa. Emitir desde un pedido crea factura, cartera y asiento.

import { NextResponse } from "next/server";
import { dbEnabled, runAsTenant } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { hasPermission, requirePermission, writeAudit } from "../../../../../lib/erp/permissions";
import { issueInvoiceFromOrder } from "../../../../../lib/erp/finance";

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
    const rows = await runAsTenant(tenantId, (tx) => tx`
      select i.id::text as id, i.number, i.issue_date, i.due_date,
             i.subtotal::float as subtotal, i.tax::float as tax, i.total::float as total,
             i.balance::float as balance, i.status,
             coalesce(p.name, 'Sin cliente') as partner,
             coalesce(je.number, '—') as journal_number
      from public.invoices_ops i
      left join public.partners p on p.id = i.partner_id
      left join public.journal_entries je on je.source_id = i.id and je.source_type = 'invoice'
      where i.tenant_id = ${tenantId}::uuid and i.prefix = 'FV'
      order by i.issue_date desc, i.created_at desc limit 100
    `, ctx.identity.role, ctx.identity.user_id);
    return NextResponse.json({ invoices: rows });
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
  const orderId = String(body.orderId || "").trim();
  if (!orderId) return NextResponse.json({ error: "Falta el pedido a facturar" }, { status: 400 });

  try {
    await requirePermission(ctx, "invoice.issue");
    const invoice = await issueInvoiceFromOrder(ctx, orderId);
    if (!invoice) {
      return NextResponse.json({ error: "Pedido no encontrado, ya facturado o sin estado válido" }, { status: 409 });
    }
    await writeAudit(ctx, "invoice.issue", "invoice", invoice.id, { orderId, number: invoice.number });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    if (error.status) {
      return NextResponse.json({ error: error.publicMessage || error.message }, { status: error.status });
    }
    const message = String(error?.message || error);
    if (message.includes("invoices_ops_tenant_number_key")) {
      return NextResponse.json({ error: "El número de factura ya existe" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
