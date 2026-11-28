// Cotizaciones operativas del negocio: muchos productos, precios con IVA
// incluido (misma convención que Samjuro) y conversión a factura FV.
// Las cotizaciones viven en invoices_ops con prefix COT y NO generan cartera
// ni asiento hasta que se convierten en factura.

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { dbEnabled, runAsTenant } from "../../../../lib/db";
import { resolveBusinessContext } from "../../../../lib/tenant-context";
import { hasPermission, requirePermission, writeAudit } from "../../../../lib/erp/permissions";
import { issueInvoiceFromQuote } from "../../../../lib/erp/finance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VAT = 0.19;
const MAX_LINES = 300;
const asText = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const money = (value) => Math.round(Number(value) * 100) / 100;
const badRequest = (message, status = 400) => Object.assign(new Error(message), { status });

function normalizeLines(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_LINES).map((line) => ({
    productId: asText(line.product_id || line.productId),
    quantity: Math.max(1, Math.floor(number(line.quantity, 1))),
    price: number(line.price, -1),
  })).filter((line) => line.productId);
}

async function buildPayload(ctx, body) {
  const tenantId = ctx.identity.tenant_id;
  const partnerId = asText(body.partner_id || body.partnerId);
  const notes = asText(body.notes).slice(0, 300) || null;
  const items = normalizeLines(body.lines);

  if (!partnerId) throw badRequest("Selecciona un cliente");
  if (!items.length) throw badRequest("Agrega al menos un producto");

  const [partners, products] = await runAsTenant(tenantId, (tx) => [
    tx`
      select id::text as id, name from public.partners
      where tenant_id = ${tenantId}::uuid and id = ${partnerId}::uuid
    `,
    tx`
      select p.id::text as id, p.sku, p.name, p.price::float as price,
             coalesce(i.id::text, p.id::text) as item_id
      from public.products p
      left join public.items i
        on i.tenant_id = p.tenant_id and i.sku = p.sku
      where p.tenant_id = ${tenantId}::uuid
        and p.id in (
          select x.id::uuid from jsonb_to_recordset(
            ${JSON.stringify(items.map((line) => ({ id: line.productId })))}::jsonb
          ) as x(id text)
        )
    `,
  ], ctx.identity.role, ctx.identity.user_id);

  if (!partners.length) throw badRequest("Cliente no encontrado");

  const byId = new Map(products.map((product) => [product.id, product]));
  const lines = items.map((line, index) => {
    const product = byId.get(line.productId);
    if (!product) throw badRequest(`Producto no disponible: ${line.productId}`);
    // price viaja como IVA incluido; si no viene, se toma del catálogo.
    const priceIncl = line.price >= 0 ? line.price : Number(product.price || 0);
    const gross = money(priceIncl * line.quantity);
    const net = money(gross / (1 + VAT));
    return {
      item_id: product.item_id,
      description: product.name,
      sku: product.sku,
      quantity: line.quantity,
      unit_price: money(net / line.quantity),
      tax_rate: VAT,
      tax_amount: money(gross - net),
      total: gross,
      line_order: index + 1,
    };
  });

  const total = money(lines.reduce((sum, line) => sum + line.total, 0));
  const subtotal = money(lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0));
  const tax = money(total - subtotal);

  return { partnerId, partner: partners[0].name, notes, lines, subtotal, tax, total };
}

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }
  if (!(await hasPermission(ctx, "finance.view"))) {
    return NextResponse.json({ error: "No tienes permiso para ver cotizaciones." }, { status: 403 });
  }

  const tenantId = ctx.identity.tenant_id;
  const params = new URL(request.url).searchParams;
  const id = asText(params.get("id"));
  const q = asText(params.get("q")).slice(0, 100);

  try {
    if (id) {
      const rows = await runAsTenant(tenantId, (tx) => [
        tx`
          select c.id::text as id, c.number, c.issue_date, c.status,
                 c.subtotal::float as subtotal, c.tax::float as tax,
                 c.total::float as total, c.notes,
                 coalesce(p.name, 'Sin cliente') as partner,
                 coalesce(p.id::text, '') as partner_id
          from public.invoices_ops c
          left join public.partners p on p.id = c.partner_id
          where c.tenant_id = ${tenantId}::uuid and c.id = ${id}::uuid and c.prefix = 'COT'
          limit 1
        `,
        tx`
          select l.id::text as id,
                 coalesce(p.id::text, l.item_id::text) as product_id,
                 l.item_id::text as item_id, l.description,
                 l.quantity::int as quantity, l.unit_price::float as unit_price,
                 l.tax_rate::float as tax_rate, l.tax_amount::float as tax_amount,
                 l.total::float as total, l.line_order::int as line_order
          from public.invoice_lines l
          left join public.items i on i.tenant_id = l.tenant_id and i.id = l.item_id
          left join public.products p on p.tenant_id = l.tenant_id and p.sku = i.sku
          where l.tenant_id = ${tenantId}::uuid and l.invoice_id = ${id}::uuid
          order by l.line_order
        `,
      ], ctx.identity.role, ctx.identity.user_id);
      if (!rows[0].length) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
      return NextResponse.json({ quote: rows[0][0], lines: rows[1] });
    }

    const rows = await runAsTenant(tenantId, (tx) => tx`
      select c.id::text as id, c.number, c.issue_date, c.status,
             c.subtotal::float as subtotal, c.tax::float as tax,
             c.total::float as total, c.notes,
             coalesce(p.name, 'Sin cliente') as partner,
             (select count(*)::int from public.invoice_lines l
               where l.invoice_id = c.id and l.tenant_id = ${tenantId}::uuid) as lines,
             (select inv.number from public.invoices_ops inv
               where inv.tenant_id = ${tenantId}::uuid and inv.prefix = 'FV'
                 and inv.notes = 'Cotización ' || c.number limit 1) as converted_invoice
      from public.invoices_ops c
      left join public.partners p on p.id = c.partner_id
      where c.tenant_id = ${tenantId}::uuid and c.prefix = 'COT'
        and (${q} = '' or c.number ilike '%' || ${q} || '%'
             or coalesce(p.name, '') ilike '%' || ${q} || '%')
      order by c.created_at desc, c.number desc
      limit 100
    `, ctx.identity.role, ctx.identity.user_id);
    return NextResponse.json({ quotes: rows });
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
  const tenantId = ctx.identity.tenant_id;
  const action = asText(body.action);

  try {
    if (action === "convert") {
      await requirePermission(ctx, "invoice.issue");
      const quoteId = asText(body.quoteId || body.id);
      if (!quoteId) throw badRequest("Falta la cotización a facturar");
      const invoice = await issueInvoiceFromQuote(ctx, quoteId);
      if (!invoice) throw badRequest("Cotización no encontrada, ya convertida o sin líneas", 409);
      await writeAudit(ctx, "invoice.issue", "invoice", invoice.id, {
        quoteId, number: invoice.number, fromQuote: true,
      });
      return NextResponse.json({ invoice }, { status: 201 });
    }

    await requirePermission(ctx, "order.create");
    const payload = await buildPayload(ctx, body);
    const year = String(new Date().getUTCFullYear());
    const quoteId = randomUUID();
    const linePayload = JSON.stringify(payload.lines.map((line) => ({
      item_id: line.item_id, description: line.description, quantity: line.quantity,
      unit_price: line.unit_price, tax_rate: line.tax_rate,
      tax_amount: line.tax_amount, total: line.total, line_order: line.line_order,
    })));

    const rows = await runAsTenant(tenantId, (tx) => [
      tx`
        with seq as (
          insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
          values (${tenantId}::uuid, 'quote', 'COT', ${year}, 2)
          on conflict (tenant_id, doc_type, prefix, period)
          do update set next_value = public.sequences.next_value + 1, updated_at = now()
          returning next_value - 1 as num
        )
        insert into public.invoices_ops
          (id, tenant_id, number, prefix, partner_id, issue_date, currency,
           subtotal, tax, total, balance, status, notes, created_by)
        select ${quoteId}::uuid, ${tenantId}::uuid,
               'COT-' || ${year} || '-' || lpad(seq.num::text, 6, '0'), 'COT',
               ${payload.partnerId}::uuid, current_date, 'COP',
               ${payload.subtotal}, ${payload.tax}, ${payload.total}, 0, 'draft',
               ${payload.notes}, ${ctx.identity.user_id || null}::uuid
        from seq
        returning id::text as id, number, status, total::float as total
      `,
      tx`
        insert into public.invoice_lines
          (id, tenant_id, invoice_id, item_id, description, quantity, unit_price,
           discount, tax_rate, tax_amount, total, line_order)
        select gen_random_uuid(), ${tenantId}::uuid, ${quoteId}::uuid,
               x.item_id::uuid, x.description, x.quantity::int, x.unit_price::numeric,
               0, x.tax_rate::numeric, x.tax_amount::numeric, x.total::numeric, x.line_order::int
        from jsonb_to_recordset(${linePayload}::jsonb) as x(
          item_id text, description text, quantity text, unit_price text,
          tax_rate text, tax_amount text, total text, line_order text
        )
      `,
    ], ctx.identity.role, ctx.identity.user_id);

    const quote = rows[0][0];
    await writeAudit(ctx, "quote.create", "quote", quoteId, {
      number: quote.number, lines: payload.lines.length, total: payload.total,
    });
    return NextResponse.json({
      quote: { ...quote, partner: payload.partner, lines: payload.lines.length },
    }, { status: 201 });
  } catch (error) {
    if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = String(error?.message || error);
    if (message.includes("invoices_ops_tenant_number_key")) {
      return NextResponse.json({ error: "El número de cotización ya existe" }, { status: 409 });
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
  const tenantId = ctx.identity.tenant_id;
  const quoteId = asText(body.quoteId || body.id);

  try {
    await requirePermission(ctx, "order.create");
    if (!quoteId) throw badRequest("Falta la cotización a editar");
    const [current] = await runAsTenant(tenantId, (tx) => tx`
      select id::text as id, status from public.invoices_ops
      where tenant_id = ${tenantId}::uuid and id = ${quoteId}::uuid and prefix = 'COT'
    `, ctx.identity.role, ctx.identity.user_id);
    if (!current) throw badRequest("Cotización no encontrada", 404);
    if (current.status !== "draft") throw badRequest("La cotización ya fue convertida", 409);

    const payload = await buildPayload(ctx, body);
    const linePayload = JSON.stringify(payload.lines.map((line) => ({
      item_id: line.item_id, description: line.description, quantity: line.quantity,
      unit_price: line.unit_price, tax_rate: line.tax_rate,
      tax_amount: line.tax_amount, total: line.total, line_order: line.line_order,
    })));

    const rows = await runAsTenant(tenantId, (tx) => [
      tx`
        update public.invoices_ops
        set partner_id = ${payload.partnerId}::uuid, notes = ${payload.notes},
            subtotal = ${payload.subtotal}, tax = ${payload.tax},
            total = ${payload.total}, updated_at = now()
        where tenant_id = ${tenantId}::uuid and id = ${quoteId}::uuid
        returning id::text as id, number, status, total::float as total
      `,
      tx`delete from public.invoice_lines where tenant_id = ${tenantId}::uuid and invoice_id = ${quoteId}::uuid`,
      tx`
        insert into public.invoice_lines
          (id, tenant_id, invoice_id, item_id, description, quantity, unit_price,
           discount, tax_rate, tax_amount, total, line_order)
        select gen_random_uuid(), ${tenantId}::uuid, ${quoteId}::uuid,
               x.item_id::uuid, x.description, x.quantity::int, x.unit_price::numeric,
               0, x.tax_rate::numeric, x.tax_amount::numeric, x.total::numeric, x.line_order::int
        from jsonb_to_recordset(${linePayload}::jsonb) as x(
          item_id text, description text, quantity text, unit_price text,
          tax_rate text, tax_amount text, total text, line_order text
        )
      `,
    ], ctx.identity.role, ctx.identity.user_id);

    await writeAudit(ctx, "quote.update", "quote", quoteId, {
      number: rows[0][0].number, lines: payload.lines.length, total: payload.total,
    });
    return NextResponse.json({
      quote: { ...rows[0][0], partner: payload.partner, lines: payload.lines.length },
    });
  } catch (error) {
    if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
