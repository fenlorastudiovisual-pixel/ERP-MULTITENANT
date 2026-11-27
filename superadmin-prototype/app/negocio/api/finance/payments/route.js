// Cartera y cobros. Un pago aplicado genera su asiento en el mismo libro contable.

import { NextResponse } from "next/server";
import { dbEnabled, runAsTenant } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { hasPermission, requirePermission, writeAudit } from "../../../../../lib/erp/permissions";
import { recordPayment } from "../../../../../lib/erp/finance";

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
    const [receivables, payments] = await runAsTenant(tenantId, (tx) => [
      tx`
        select r.id::text as id, r.amount::float as amount, r.balance::float as balance,
               r.due_date, r.status, i.number as invoice,
               coalesce(p.name, 'Sin cliente') as partner, p.id::text as partner_id
        from public.receivables r
        join public.invoices_ops i on i.id = r.invoice_id
        left join public.partners p on p.id = r.partner_id
        where r.tenant_id = ${tenantId}::uuid and r.balance > 0
        order by r.due_date asc limit 100
      `,
      tx`
        select id::text as id, number, payment_date, method,
               amount::float as amount, unapplied::float as unapplied, status
        from public.payments_in
        where tenant_id = ${tenantId}::uuid
        order by created_at desc limit 50
      `,
    ], ctx.identity.role, ctx.identity.user_id);
    return NextResponse.json({ receivables, payments });
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
  const tenantId = ctx.identity.tenant_id;

  let body = null;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Datos inválidos" }, { status: 400 }); }
  const partnerId = String(body.partnerId || "").trim();
  const amount = Number(body.amount);
  const method = String(body.method || "transfer");
  const reference = String(body.reference || "").slice(0, 120) || null;
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];

  if (!partnerId) return NextResponse.json({ error: "Falta el cliente" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "El pago debe ser mayor a cero" }, { status: 400 });
  if (!["cash", "bank", "transfer", "card", "pse"].includes(method)) {
    return NextResponse.json({ error: "Método de pago no válido" }, { status: 400 });
  }
  for (const item of allocations) {
    if (!item.receivableId || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) {
      return NextResponse.json({ error: "Aplicación de pago no válida" }, { status: 400 });
    }
  }
  const applied = allocations.reduce((sum, item) => sum + Number(item.amount), 0);
  if (applied > amount + 0.01) {
    return NextResponse.json({ error: "Las aplicaciones superan el valor del pago" }, { status: 400 });
  }

  try {
    await requirePermission(ctx, "payment.record");
    if (allocations.length) {
      const payload = JSON.stringify(allocations.map((item) => ({
        receivable_id: String(item.receivableId), amount: Number(item.amount),
      })));
      const current = await runAsTenant(tenantId, (tx) => tx`
        select r.id::text as id, r.balance::float as balance, r.partner_id::text as partner_id
        from jsonb_to_recordset(${payload}::jsonb) as a(receivable_id text, amount numeric)
        left join public.receivables r
          on r.id = a.receivable_id::uuid and r.tenant_id = ${tenantId}::uuid
      `, ctx.identity.role, ctx.identity.user_id);
      for (const item of allocations) {
        const row = current.find((entry) => entry.id === String(item.receivableId));
        if (!row) {
          return NextResponse.json({ error: "La cuenta por cobrar no existe en este negocio" }, { status: 404 });
        }
        if (row.partner_id !== partnerId) {
          return NextResponse.json({ error: "La cuenta por cobrar pertenece a otro cliente" }, { status: 400 });
        }
        if (Number(item.amount) > Number(row.balance) + 0.01) {
          return NextResponse.json({ error: "La aplicación supera el saldo pendiente" }, { status: 400 });
        }
      }
    }
    const payment = await recordPayment(ctx, { partnerId, amount, method, reference, allocations });
    await writeAudit(ctx, "payment.record", "payment", payment.id, {
      number: payment.number, amount: payment.amount, method,
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    if (error.status) {
      return NextResponse.json({ error: error.publicMessage || error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
