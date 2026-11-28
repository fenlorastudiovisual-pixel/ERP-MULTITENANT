// Servidor únicamente. Traduce las tablas del Ultra ERP a los objetos que
// consumen los motores puros (ledger.js / consolidation.js) y persiste el
// resultado. Nunca ejecuta DDL y nunca toma el tenant del bodies de la request.

import { buildPostingPlan, RATE_TYPES } from "./ledger.js";
import { consolidateBalances } from "./consolidation.js";
import { uuidOrNull } from "./workflow-store.js";

// Carga diferida para no arrastrar el cliente Postgres a un bundle cliente.
async function defaultRunner(tenantId, build, role, actorId) {
  const { runAsTenant } = await import("../db.js");
  return runAsTenant(tenantId, build, role, actorId);
}

const json = (value) => JSON.stringify(value ?? {});
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCIES = new Set(["COP", "CLP", "USD", "EUR", "MXN", "ARS"]);

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

/** Convierte errores de Postgres en respuestas seguras, sin connection strings. */
export function accountingError(error) {
  const message = String(error?.message || error);
  if (error?.code === "42P01" || /relation .*erp_.* does not exist/i.test(message)) {
    return fail(503, "La migración Ultra ERP no está aplicada en esta base de datos. Revisa docs/ULTRA-ERP-ROADMAP.md antes de continuar.");
  }
  const safe = message.slice(0, 400);
  const wrapped = new Error(safe);
  wrapped.status = Number(error?.status) || 500;
  wrapped.publicMessage = error?.publicMessage || safe;
  return wrapped;
}

function clampLimit(value, fallback = 60, max = 500) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), max)
    : fallback;
}

/**
 * @param {object} options
 * @param {function} options.runner  runAsTenant o un doble de prueba.
 * @param {string} options.role      app.user_role usado por RLS.
 * @param {string} options.actorId   app.actor_id usado por auditoría.
 */
export function createAccountingService({ runner = defaultRunner, role = "tenant_user", actorId = "" } = {}) {
  if (typeof runner !== "function") throw new Error("createAccountingService: runner inválido");
  const query = (tenantId, build) => runner(tenantId, build, role, actorId);

  async function listConfiguration(tenantId) {
    const [ledgers, rules, rates, groups, members] = await query(tenantId, (tx) => [
      tx`
        select id::text as id, code, kind, currency::text as currency,
               is_base, entity_id::text as entity_id, status
        from public.erp_ledgers
        where tenant_id = ${tenantId}::uuid
        order by code
      `,
      tx`
        select id::text as id, code, source_type, ledger_id::text as ledger_id,
               account_map, dimension_map, rounding_account, priority, active
        from public.erp_posting_rules
        where tenant_id = ${tenantId}::uuid
        order by priority desc, code
      `,
      tx`
        select from_currency::text as from_currency, to_currency::text as to_currency,
               rate_type, rate_date::text as rate_date, rate::float as rate
        from public.erp_currency_rates
        where tenant_id = ${tenantId}::uuid
        order by rate_date desc
        limit 1000
      `,
      tx`
        select id::text as id, code, name, reporting_currency::text as reporting_currency,
               method, status
        from public.erp_consolidation_groups
        where tenant_id = ${tenantId}::uuid
        order by code
      `,
      tx`
        select group_id::text as group_id, entity_id::text as entity_id,
               ownership::float as ownership, effective_from::text as effective_from,
               effective_to::text as effective_to, method
        from public.erp_consolidation_members
        where tenant_id = ${tenantId}::uuid
        order by effective_from desc
        limit 1000
      `,
    ]);
    return { ledgers, rules, rates, groups, members };
  }

  async function listDerivedEntries(tenantId, limit) {
    return query(tenantId, (tx) => tx`
      select d.id::text as id, d.source_type, d.source_id,
             d.ledger_id::text as ledger_id, l.code as ledger_code,
             d.entity_id::text as entity_id, d.entry_date::text as entry_date,
             d.currency::text as currency, d.rate::float as rate,
             d.rate_type, d.status, d.total_debit::float as total_debit,
             d.total_credit::float as total_credit, d.created_at
      from public.erp_derived_entries d
      join public.erp_ledgers l on l.id = d.ledger_id and l.tenant_id = d.tenant_id
      where d.tenant_id = ${tenantId}::uuid
      order by d.entry_date desc, d.created_at desc
      limit ${clampLimit(limit)}::int
    `);
  }

  /** Lee un asiento operativo publicado y lo convierte en fuente del motor. */
  async function loadJournalSource(tenantId, sourceId) {
    const id = uuidOrNull(sourceId);
    if (!id) return null;
    const rows = await query(tenantId, (tx) => tx`
      select je.id::text as id, je.entry_date::text as entry_date,
             je.source_type, je.source_id::text as source_document_id,
             je.description,
             coalesce((
               select i.currency::text from public.invoices_ops i
               where i.tenant_id = je.tenant_id and i.id = je.source_id
             ), 'COP') as currency,
             coalesce((
               select jsonb_agg(jsonb_build_object(
                 'account', a.code,
                 'debit', jl.debit::float,
                 'credit', jl.credit::float,
                 'dimensions', jsonb_build_object('partner_id', jl.partner_id::text)
               ) order by jl.line_order)
               from public.journal_lines jl
               join public.accounts a on a.id = jl.account_id and a.tenant_id = jl.tenant_id
               where jl.tenant_id = je.tenant_id and jl.entry_id = je.id
             ), '[]'::jsonb) as lines
      from public.journal_entries je
      where je.tenant_id = ${tenantId}::uuid
        and je.id = ${id}::uuid
        and je.status = 'posted'
      limit 1
    `);
    const row = rows?.[0];
    if (!row) return null;
    return {
      id: row.id,
      tenant_id: tenantId,
      source_type: row.source_type,
      source_document_id: row.source_document_id,
      entry_date: row.entry_date,
      description: row.description,
      currency: CURRENCIES.has(String(row.currency || "").toUpperCase())
        ? String(row.currency).toUpperCase()
        : "COP",
      dimensions: { journal_entry: row.id },
      lines: Array.isArray(row.lines) ? row.lines : [],
    };
  }

  /** Inserta cada asiento derivado una sola vez (conflict por clave natural). */
  async function persistPlan(tenantId, plan) {
    const inserted = [];
    for (const entry of plan?.entries || []) {
      const rows = await query(tenantId, (tx) => tx`
        insert into public.erp_derived_entries (
          tenant_id, source_type, source_id, ledger_id, entity_id, rule_id,
          entry_date, currency, rate, rate_type, lines,
          total_debit, total_credit, status
        )
        values (
          ${tenantId}::uuid, ${entry.source_type}, ${entry.source_id},
          ${uuidOrNull(entry.ledger_id)}::uuid, ${uuidOrNull(entry.entity_id)}::uuid,
          ${uuidOrNull(entry.rule_id)}::uuid, ${entry.entry_date}::date,
          ${entry.currency}, ${entry.rate}::numeric, ${entry.rate_type},
          ${json(entry.lines)}::jsonb, ${entry.total_debit}::numeric,
          ${entry.total_credit}::numeric, 'draft'
        )
        on conflict (tenant_id, source_type, source_id, ledger_id) do nothing
        returning id::text as id, ledger_id::text as ledger_id
      `);
      if (rows?.[0]) inserted.push(rows[0]);
    }
    return inserted;
  }

  async function loadConsolidationInput(tenantId, groupCode, date) {
    const groups = await query(tenantId, (tx) => tx`
      select id::text as id, code, name,
             reporting_currency::text as reporting_currency, method, status
      from public.erp_consolidation_groups
      where tenant_id = ${tenantId}::uuid and code = ${String(groupCode).toUpperCase()}
      limit 1
    `);
    const group = groups?.[0];
    if (!group) return null;

    const [members, rates, entries, eliminations] = await query(tenantId, (tx) => [
      tx`
        select entity_id::text as entity_id, ownership::float as ownership,
               effective_from::text as effective_from, effective_to::text as effective_to,
               method
        from public.erp_consolidation_members
        where tenant_id = ${tenantId}::uuid
          and group_id = ${group.id}::uuid
          and effective_from <= ${date}::date
          and (effective_to is null or effective_to >= ${date}::date)
        order by entity_id
      `,
      tx`
        select from_currency::text as from_currency, to_currency::text as to_currency,
               rate_type, rate_date::text as rate_date, rate::float as rate
        from public.erp_currency_rates
        where tenant_id = ${tenantId}::uuid
        order by rate_date desc
        limit 1000
      `,
      tx`
        select d.entity_id::text as entity_id, d.entry_date::text as entry_date,
               d.currency::text as currency, d.rate::float as rate,
               d.rate_type, d.lines
        from public.erp_derived_entries d
        join public.erp_ledgers l
          on l.id = d.ledger_id and l.tenant_id = d.tenant_id
        where d.tenant_id = ${tenantId}::uuid
          and d.status = 'draft'
          and l.kind = 'group'
          and d.entry_date <= ${date}::date
        order by d.entry_date desc
        limit 2000
      `,
      tx`
        select match_key, currency::text as currency, lines
        from public.erp_elimination_entries
        where tenant_id = ${tenantId}::uuid
          and group_id = ${group.id}::uuid
          and period = ${date}::date
          and status = 'draft'
      `,
    ]);

    return { group, members, rates, entries, eliminations };
  }

  return {
    query,
    listConfiguration,
    listDerivedEntries,
    loadJournalSource,
    persistPlan,
    loadConsolidationInput,
  };
}

function normalizeSourceType(value) {
  return String(value || "").trim().toLowerCase();
}

/** Deriva el plan completo sin escribir en la BD. */
export async function derivePostingPlan({
  service,
  tenantId,
  sourceId,
  sourceType = null,
  ledgerCodes = [],
  rateType = "closing",
  entityId = null,
} = {}) {
  if (!service || !tenantId || !sourceId) throw fail(400, "service, tenantId y sourceId requeridos");
  if (!RATE_TYPES.includes(rateType)) throw fail(400, `Tipo de tasa inválido: ${rateType}`);

  const source = await service.loadJournalSource(tenantId, sourceId);
  if (!source) throw fail(404, "Asiento operativo no encontrado o no está publicado");
  if (sourceType && normalizeSourceType(sourceType) !== normalizeSourceType(source.source_type)) {
    throw fail(409, `El asiento es de tipo ${source.source_type}, no ${sourceType}`);
  }
  if (!Array.isArray(source.lines) || !source.lines.length) {
    throw fail(422, "El asiento operativo no tiene líneas");
  }

  const config = await service.listConfiguration(tenantId);
  let ledgers = config.ledgers;
  const requested = (Array.isArray(ledgerCodes) ? ledgerCodes : [])
    .map((code) => String(code).trim().toLowerCase());
  if (requested.length) {
    ledgers = ledgers.filter((ledger) => requested.includes(String(ledger.code).toLowerCase()));
    const found = new Set(ledgers.map((ledger) => String(ledger.code).toLowerCase()));
    const unknown = requested.filter((code) => !found.has(code));
    if (unknown.length) throw fail(404, `Libros no configurados: ${unknown.join(", ")}`);
  }
  if (!ledgers.length) {
    throw fail(404, "No hay libros configurados. Carga database/seed-ultra-config.sql después de aplicar la migración.");
  }

  const plan = buildPostingPlan({
    source,
    ledgers,
    rules: config.rules.filter((rule) => rule.active !== false),
    rateBook: config.rates,
    rate_type: rateType,
  });

  for (const entry of plan.entries) {
    const ledger = ledgers.find((item) => item.id === entry.ledger_id);
    entry.entity_id = uuidOrNull(entityId) || uuidOrNull(ledger?.entity_id) || null;
  }

  return {
    source: {
      id: source.id,
      source_type: source.source_type,
      source_document_id: source.source_document_id,
      entry_date: source.entry_date,
      currency: source.currency,
      lines: source.lines.length,
    },
    plan,
  };
}

/** Consolida los asientos derivados ya publicados en el libro del grupo. */
export async function buildConsolidationReport({
  service,
  tenantId,
  groupCode,
  date,
  rateType = "closing",
} = {}) {
  if (!service || !tenantId || !groupCode) throw fail(400, "service, tenantId y groupCode requeridos");
  if (!DATE_RE.test(String(date || ""))) throw fail(400, "La fecha debe tener formato YYYY-MM-DD");
  if (!RATE_TYPES.includes(rateType)) throw fail(400, `Tipo de tasa inválido: ${rateType}`);

  const input = await service.loadConsolidationInput(tenantId, groupCode, String(date));
  if (!input) throw fail(404, `Grupo de consolidación no encontrado: ${groupCode}`);

  const report = consolidateBalances({
    entries: input.entries || [],
    members: input.members || [],
    groupCurrency: input.group.reporting_currency,
    rates: input.rates || [],
    date: String(date),
    rate_type: rateType,
    eliminations: input.eliminations || [],
  });

  return { group: input.group, report };
}
