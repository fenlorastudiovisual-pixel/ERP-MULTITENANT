import { readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

const ROOT = "D:\\datos\\Desktop\\FENLORA VISUAL STUDIO\\SAMJURO-EXPORT";
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = envText.match(/^DATABASE_URL=(.*)$/m)?.[1].replace(/^["']|["']$/g, "");
if (!url) throw new Error("DATABASE_URL no encontrada");
const sql = neon(url);

const u = (s) => {
  const h = crypto.createHash("md5").update(String(s)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const num = (v) => Number(v || 0);
const text = (v) => (v == null ? "" : String(v));
const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);
const r2 = (v) => Math.round(v * 100) / 100;

const get = async (name) => {
  const rows = await sql`select payload from samjuro_stage.raw_tables where name = ${name}`;
  if (!rows[0]) throw new Error(`Falta la tabla en staging: ${name}`);
  return rows[0].payload;
};

const [tenant] = await sql`select id::text as id from public.tenants where source_key = 't17_sandbox'`;
if (!tenant) throw new Error("No existe t17_sandbox");
const T = tenant.id;

const quotes = await get("cotizaciones");
const quotePayments = await get("cotizacion_pagos");
const soldOut = await get("productos_agotado");
const products = await get("productos");

const partnerRows = await sql`select id::text as id, document from public.partners where tenant_id = ${T}::uuid`;
const byDoc = new Map(partnerRows.filter((p) => p.document).map((p) => [String(p.document), p.id]));
const accountRows = await sql`select code, id::text as id from public.accounts where tenant_id = ${T}::uuid`;
const account = new Map(accountRows.map((a) => [a.code, a.id]));
for (const code of ["1105", "1110", "1305", "4135", "4750"]) {
  if (!account.has(code)) throw new Error(`Falta la cuenta ${code} en el tenant`);
}
const [seqRow] = await sql`
  select coalesce(max(next_value), 1)::int as base from public.sequences
  where tenant_id = ${T}::uuid and doc_type = 'journal' and prefix = 'AS' and period = '2026'
`;
const journalBase = seqRow.base;

const newPartners = new Map();
for (const q of quotes) {
  const doc = text(q.documento);
  if (doc && !byDoc.has(doc)) {
    newPartners.set(doc, text(q.cliente_nombre) || `Cliente COT ${doc}`);
    byDoc.set(doc, u(`${doc}:quote-partner:${T}`));
  }
}

const paymentsByQuote = new Map();
for (const p of quotePayments) {
  const key = String(p.cotizacion_id);
  if (!paymentsByQuote.has(key)) paymentsByQuote.set(key, []);
  paymentsByQuote.get(key).push(p);
}

const quoteById = new Map(quotes.map((q) => [String(q.id), q]));
const invoiceRows = [];
const receivableRows = [];
const paymentRows = [];
const allocationRows = [];
const journalRows = [];
const journalLineRows = [];

let journalNum = journalBase;
const addJournal = (entry) => {
  journalNum += 1;
  const journalKey = `${entry.sourceType}:${entry.key}`;
  const id = u(`${journalKey}:journal:${T}`);
  journalRows.push({
    id,
    number: `AS-${String(journalNum).padStart(6, "0")}`,
    date: entry.date,
    description: entry.description,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    debit: r2(entry.debit),
    credit: r2(entry.credit),
  });
  for (const line of entry.lines) {
    journalLineRows.push({
      id: u(`${journalKey}:journalline:${line.code}:${T}`),
      entryId: id,
      accountId: account.get(line.code),
      debit: r2(line.debit || 0),
      credit: r2(line.credit || 0),
      partnerId: entry.partnerId || null,
      refType: entry.sourceType,
      refId: entry.sourceId,
      order: line.order,
    });
  }
};

for (const q of quotes) {
  const key = String(q.id);
  const invoiceId = u(`${key}:quote-invoice:${T}`);
  const number = text(q.consecutivo).slice(0, 80);
  const total = r2(num(q.total));
  const subtotal = r2(total / 1.19);
  const tax = r2(total - subtotal);
  const pays = paymentsByQuote.get(key) || [];
  const paid = r2(pays.reduce((s, p) => s + num(p.valor), 0));
  const balance = r2(Math.max(0, total - paid));
  const status = balance <= 0 ? "paid" : paid > 0 ? "partial" : "issued";
  const partnerId = byDoc.get(text(q.documento)) || null;
  const issueDate = day(q.fecha) || day(q.creado) || day(q.creado);
  const notes = [
    "Cotización histórica importada desde la Supabase de Samjuro (solo lectura).",
    `Estado: ${text(q.estado_override) || "sin estado"}.`,
    `Asesor: ${text(q.asesor) || "sin asesor"}.`,
    `Forma de pago: ${text(q.forma_pago) || "no indicada"}.`,
    `Origen: ${text(q.origen) || "no indicado"}.`,
  ].join(" ");

  invoiceRows.push({
    id: invoiceId, number, partnerId, issueDate, subtotal, tax, total, balance,
    status, notes, createdAt: q.creado || q.fecha || null,
  });
  receivableRows.push({
    id: u(`${key}:quote-receivable:${T}`), invoiceId, partnerId, amount: total,
    balance, status, dueDate: null, createdAt: q.creado || q.fecha || null,
  });
  addJournal({
    key, date: issueDate, description: `Cotización ${number}`,
    sourceType: "quote", sourceId: invoiceId, partnerId, debit: total, credit: total,
    lines: [
      { code: "1305", debit: total, credit: 0, order: 1 },
      { code: "4135", debit: 0, credit: subtotal, order: 2 },
      { code: "4750", debit: 0, credit: tax, order: 3 },
    ],
  });

  let remaining = total;
  for (const p of pays) {
    const amount = r2(num(p.valor));
    if (amount <= 0) continue;
    const paymentId = u(`${String(p.id)}:quote-payment:${T}`);
    const allocated = r2(Math.min(amount, remaining));
    remaining = r2(remaining - allocated);
    paymentRows.push({
      id: paymentId,
      number: `PA-COT-${String(p.id).padStart(5, "0")}`,
      partnerId,
      date: day(p.fecha) || issueDate,
      amount,
      unapplied: r2(amount - allocated),
      reference: `Abono cotización ${number}${p.nota ? ` · ${text(p.nota)}` : ""}`,
      createdAt: p.creado || p.fecha || null,
    });
    allocationRows.push({
      id: u(`${String(p.id)}:quote-allocation:${T}`),
      paymentId,
      receivableId: u(`${key}:quote-receivable:${T}`),
      amount: allocated,
    });
    addJournal({
      key: String(p.id), date: day(p.fecha) || issueDate,
      description: `Abono cotización ${number}`, sourceType: "quote_payment",
      sourceId: paymentId, partnerId, debit: amount, credit: amount,
      lines: [
        { code: "1110", debit: amount, credit: 0, order: 1 },
        { code: "1305", debit: 0, credit: amount, order: 2 },
      ],
    });
  }
}

const out = new Map();
for (const s of soldOut) {
  const id = String(s.producto_id);
  if (!out.has(id)) out.set(id, new Set());
  out.get(id).add(text(s.presentacion));
}

writeFileSync(`${ROOT}\\pilot-extras-plan.json`, JSON.stringify({
  tenant_id: T,
  quotes: invoiceRows.length,
  payments: paymentRows.length,
  journals: journalRows.length,
  journal_lines: journalLineRows.length,
  new_partners: newPartners.size,
  sold_out_products: out.size,
  total_cotizado: r2(invoiceRows.reduce((s, r) => s + r.total, 0)),
  total_abonado: r2(paymentRows.reduce((s, r) => s + r.amount, 0)),
}, null, 2));

await sql.transaction((tx) => {
  const q = [];
  for (const table of [
    "payment_allocations", "payments_in", "receivables", "invoice_lines",
    "invoices_ops", "journal_lines", "journal_entries",
  ]) {
    q.push(tx.query(`delete from public.${table} where tenant_id = $1::uuid`, [T]));
  }

  if (newPartners.size) {
    const entries = [...newPartners.entries()];
    q.push(tx`
      insert into public.partners (id, tenant_id, kind, document_type, document, name, active)
      select * from unnest(
        ${entries.map(([doc]) => u(`${doc}:quote-partner:${T}`))}::uuid[],
        ${Array(entries.length).fill(T)}::uuid[],
        ${Array(entries.length).fill("customer")}::text[],
        ${Array(entries.length).fill("CC")}::text[],
        ${entries.map(([doc]) => doc)}::text[],
        ${entries.map(([, name]) => name)}::text[],
        ${Array(entries.length).fill(true)}::boolean[]
      ) as t(id, tenant_id, kind, document_type, document, name, active)
      on conflict (tenant_id, document_type, document) do nothing
    `);
  }

  const i = invoiceRows.length;
  q.push(tx`
    insert into public.invoices_ops
      (id, tenant_id, number, prefix, partner_id, issue_date, currency, subtotal, tax, total, balance, status, notes, created_at)
    select * from unnest(
      ${invoiceRows.map((r) => r.id)}::uuid[], ${Array(i).fill(T)}::uuid[],
      ${invoiceRows.map((r) => r.number)}::text[], ${Array(i).fill("COT")}::text[],
      ${invoiceRows.map((r) => r.partnerId)}::uuid[], ${invoiceRows.map((r) => r.issueDate)}::date[],
      ${Array(i).fill("COP")}::char(3)[], ${invoiceRows.map((r) => r.subtotal)}::numeric[],
      ${invoiceRows.map((r) => r.tax)}::numeric[], ${invoiceRows.map((r) => r.total)}::numeric[],
      ${invoiceRows.map((r) => r.balance)}::numeric[], ${invoiceRows.map((r) => r.status)}::text[],
      ${invoiceRows.map((r) => r.notes)}::text[], ${invoiceRows.map((r) => r.createdAt)}::timestamptz[]
    ) as t(id, tenant_id, number, prefix, partner_id, issue_date, currency, subtotal, tax, total, balance, status, notes, created_at)
  `);

  const rc = receivableRows.length;
  q.push(tx`
    insert into public.receivables (id, tenant_id, invoice_id, partner_id, amount, balance, due_date, status, created_at)
    select * from unnest(
      ${receivableRows.map((r) => r.id)}::uuid[], ${Array(rc).fill(T)}::uuid[],
      ${receivableRows.map((r) => r.invoiceId)}::uuid[], ${receivableRows.map((r) => r.partnerId)}::uuid[],
      ${receivableRows.map((r) => r.amount)}::numeric[], ${receivableRows.map((r) => r.balance)}::numeric[],
      ${receivableRows.map((r) => r.dueDate)}::date[], ${receivableRows.map((r) => r.status)}::text[],
      ${receivableRows.map((r) => r.createdAt)}::timestamptz[]
    ) as t(id, tenant_id, invoice_id, partner_id, amount, balance, due_date, status, created_at)
  `);

  const pa = paymentRows.length;
  q.push(tx`
    insert into public.payments_in (id, tenant_id, number, partner_id, payment_date, method, amount, unapplied, reference, status, created_at)
    select * from unnest(
      ${paymentRows.map((r) => r.id)}::uuid[], ${Array(pa).fill(T)}::uuid[],
      ${paymentRows.map((r) => r.number)}::text[], ${paymentRows.map((r) => r.partnerId)}::uuid[],
      ${paymentRows.map((r) => r.date)}::date[], ${Array(pa).fill("transfer")}::text[],
      ${paymentRows.map((r) => r.amount)}::numeric[], ${paymentRows.map((r) => r.unapplied)}::numeric[],
      ${paymentRows.map((r) => r.reference)}::text[], ${Array(pa).fill("registered")}::text[],
      ${paymentRows.map((r) => r.createdAt)}::timestamptz[]
    ) as t(id, tenant_id, number, partner_id, payment_date, method, amount, unapplied, reference, status, created_at)
  `);

  const al = allocationRows.length;
  q.push(tx`
    insert into public.payment_allocations (id, tenant_id, payment_id, receivable_id, amount)
    select * from unnest(
      ${allocationRows.map((r) => r.id)}::uuid[], ${Array(al).fill(T)}::uuid[],
      ${allocationRows.map((r) => r.paymentId)}::uuid[], ${allocationRows.map((r) => r.receivableId)}::uuid[],
      ${allocationRows.map((r) => r.amount)}::numeric[]
    ) as t(id, tenant_id, payment_id, receivable_id, amount)
  `);

  const j = journalRows.length;
  q.push(tx`
    insert into public.journal_entries
      (id, tenant_id, number, entry_date, description, source_type, source_id, total_debit, total_credit, status, created_at)
    select * from unnest(
      ${journalRows.map((r) => r.id)}::uuid[], ${Array(j).fill(T)}::uuid[],
      ${journalRows.map((r) => r.number)}::text[], ${journalRows.map((r) => r.date)}::date[],
      ${journalRows.map((r) => r.description)}::text[], ${journalRows.map((r) => r.sourceType)}::text[],
      ${journalRows.map((r) => r.sourceId)}::uuid[], ${journalRows.map((r) => r.debit)}::numeric[],
      ${journalRows.map((r) => r.credit)}::numeric[], ${Array(j).fill("posted")}::text[],
      ${journalRows.map((r) => r.date)}::timestamptz[]
    ) as t(id, tenant_id, number, entry_date, description, source_type, source_id, total_debit, total_credit, status, created_at)
  `);

  const jl = journalLineRows.length;
  q.push(tx`
    insert into public.journal_lines
      (id, tenant_id, entry_id, account_id, debit, credit, partner_id, ref_type, ref_id, line_order)
    select * from unnest(
      ${journalLineRows.map((r) => r.id)}::uuid[], ${Array(jl).fill(T)}::uuid[],
      ${journalLineRows.map((r) => r.entryId)}::uuid[], ${journalLineRows.map((r) => r.accountId)}::uuid[],
      ${journalLineRows.map((r) => r.debit)}::numeric[], ${journalLineRows.map((r) => r.credit)}::numeric[],
      ${journalLineRows.map((r) => r.partnerId)}::uuid[], ${journalLineRows.map((r) => r.refType)}::text[],
      ${journalLineRows.map((r) => r.refId)}::uuid[], ${journalLineRows.map((r) => r.order)}::integer[]
    ) as t(id, tenant_id, entry_id, account_id, debit, credit, partner_id, ref_type, ref_id, line_order)
  `);

  q.push(tx`
    update public.sequences set next_value = greatest(next_value, ${journalNum}), updated_at = now()
    where tenant_id = ${T}::uuid and doc_type = 'journal' and prefix = 'AS' and period = '2026'
  `);

  const soldIds = [...out.keys()];
  q.push(tx`
    update public.items set description = 'Agotado según Supabase. ' || coalesce(description, ''), updated_at = now()
    where tenant_id = ${T}::uuid and id = any(${soldIds.map((id) => u(`${id}:product:${T}`))}::uuid[])
      and coalesce(description, '') not like 'Agotado según Supabase.%'
  `);
  q.push(tx`
    update public.products set description = 'Agotado según Supabase. ' || coalesce(description, ''), updated_at = now()
    where tenant_id = ${T}::uuid and id = any(${soldIds.map((id) => u(`${id}:product:${T}`))}::uuid[])
      and coalesce(description, '') not like 'Agotado según Supabase.%'
  `);
  return q;
});

const after = await sql`
  select
    (select count(*)::int from public.invoices_ops where tenant_id = ${T}::uuid and prefix = 'COT') as cotizaciones,
    (select count(*)::int from public.receivables where tenant_id = ${T}::uuid) as cartera,
    (select count(*)::int from public.payments_in where tenant_id = ${T}::uuid and number like 'PA-COT%') as abonos,
    (select count(*)::int from public.journal_entries where tenant_id = ${T}::uuid) as asientos,
    (select count(*)::int from public.journal_lines where tenant_id = ${T}::uuid) as lineas_asiento,
    (select count(*)::int from public.journal_entries where tenant_id = ${T}::uuid and total_debit <> total_credit) as desbalanceados,
    (select count(*)::int from public.items where tenant_id = ${T}::uuid and description like 'Agotado según Supabase.%') as agotados
`;
writeFileSync(`${ROOT}\\pilot-extras-after.json`, JSON.stringify({ tenant_id: T, after }, null, 2));
console.log(JSON.stringify({ after, inserted: {
  quotes: invoiceRows.length, payments: paymentRows.length,
  journals: journalRows.length, journal_lines: journalLineRows.length,
  new_partners: newPartners.size, sold_out_products: out.size,
} }, null, 2));
