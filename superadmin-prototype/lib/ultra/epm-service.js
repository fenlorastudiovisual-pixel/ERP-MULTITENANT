// Servidor únicamente. Persiste los objetos EPM y alimenta los motores puros
// (epm.js) con datos reales del tenant. Nunca ejecuta DDL, nunca toma el tenant
// del body y nunca inventa tasas ni importes.

import { randomUUID } from "node:crypto";
import {
  buildCashPosition,
  buildForecast,
  compareBudget,
  defineBudget,
  normalizeDimensions,
} from "./epm.js";
import { fromMinor, toMinor } from "./money.js";
import { accountingError } from "./accounting-service.js";
import { uuidOrNull } from "./workflow-store.js";

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

function clampLimit(value, fallback = 60, max = 500) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), max)
    : fallback;
}

function currencyOf(value) {
  const code = String(value || "COP").toUpperCase();
  if (!CURRENCIES.has(code)) throw fail(422, `Moneda no soportada: ${code}`);
  return code;
}

function periodBounds(period) {
  const [year, month] = String(period).split("-").map(Number);
  const start = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  return { start, end: `${String(endYear).padStart(4, "0")}-${String(endMonth).padStart(2, "0")}-01` };
}

/**
 * @param {object} options
 * @param {function} options.runner  runAsTenant o un doble de prueba.
 * @param {string} options.role      app.user_role usado por RLS.
 * @param {string} options.actorId   app.actor_id usado por auditoría.
 */
export function createEpmService({ runner = defaultRunner, role = "tenant_user", actorId = "" } = {}) {
  if (typeof runner !== "function") throw new Error("createEpmService: runner inválido");
  const query = (tenantId, build) => runner(tenantId, build, role, actorId);

  /** Si no se indica entidad, solo se resuelve automáticamente si hay una. */
  async function resolveEntityId(tenantId, entityId) {
    const explicit = uuidOrNull(entityId);
    if (explicit) return explicit;
    const rows = await query(tenantId, (tx) => tx`
      select id::text as id
      from public.erp_entities
      where tenant_id = ${tenantId}::uuid and status = 'active'
      order by code
      limit 2
    `);
    if (!rows.length) throw fail(422, "No hay entidades configuradas para este tenant");
    if (rows.length > 1) throw fail(422, "Hay varias entidades: indica entityId");
    return rows[0].id;
  }

  function hydrateBudget(budget, lines) {
    const currency = String(budget.currency || "COP").toUpperCase();
    return {
      ...budget,
      dimensions: budget.dimensions || {},
      lines: (lines || []).map((line) => ({
        line_no: Number(line.line_no),
        account: line.account,
        dimensions: line.dimensions || {},
        amount: fromMinor(Number(line.amount_minor), currency),
      })),
    };
  }

  async function listBudgets(tenantId, limit) {
    const [budgets, lines] = await query(tenantId, (tx) => [
      tx`
        select id::text as id, code, name, period, currency::text as currency,
               entity_id::text as entity_id, dimensions, status, created_at
        from public.erp_budgets
        where tenant_id = ${tenantId}::uuid
        order by period desc, code
        limit ${clampLimit(limit)}::int
      `,
      tx`
        select budget_id::text as budget_id, line_no, account, dimensions, amount_minor::float as amount_minor
        from public.erp_budget_lines
        where tenant_id = ${tenantId}::uuid
        order by budget_id, line_no
        limit 4000
      `,
    ]);
    const byBudget = new Map();
    for (const line of lines) {
      if (!byBudget.has(line.budget_id)) byBudget.set(line.budget_id, []);
      byBudget.get(line.budget_id).push(line);
    }
    return budgets.map((budget) => hydrateBudget(budget, byBudget.get(budget.id) || []));
  }

  async function getBudget(tenantId, budgetId) {
    const id = uuidOrNull(budgetId);
    if (!id) throw fail(422, "budgetId inválido");
    const [budget] = await query(tenantId, (tx) => tx`
      select id::text as id, code, name, period, currency::text as currency,
             entity_id::text as entity_id, dimensions, status, created_at
      from public.erp_budgets
      where tenant_id = ${tenantId}::uuid and id = ${id}::uuid
    `);
    if (!budget) throw fail(404, "Presupuesto no encontrado");
    const lines = await query(tenantId, (tx) => tx`
      select budget_id::text as budget_id, line_no, account, dimensions, amount_minor::float as amount_minor
      from public.erp_budget_lines
      where tenant_id = ${tenantId}::uuid and budget_id = ${id}::uuid
      order by line_no
    `);
    return hydrateBudget(budget, lines);
  }

  /** Inserta/actualiza el presupuesto y sus líneas en una sola transacción. */
  async function saveBudget(tenantId, input = {}) {
    const budget = defineBudget({ ...input, tenant_id: tenantId });
    const currency = currencyOf(budget.currency);
    // La cabecera se confirma primero: en un re-guardado, ON CONFLICT devuelve
    // el id existente, no el generado aquí. Las líneas deben usar ese id real.
    const [row] = await query(tenantId, (tx) => tx`
      insert into public.erp_budgets
        (id, tenant_id, entity_id, code, name, period, currency, dimensions, status)
      values
        (${randomUUID()}::uuid, ${tenantId}::uuid, ${uuidOrNull(budget.entity_id)}::uuid,
         ${budget.code}, ${budget.name}, ${budget.period}, ${currency},
         ${json(budget.dimensions)}::jsonb, ${budget.status})
      on conflict (tenant_id, code, period) do update set
        name = excluded.name,
        entity_id = excluded.entity_id,
        currency = excluded.currency,
        dimensions = excluded.dimensions,
        status = excluded.status
      returning id::text as id
    `);
    const id = row.id;
    await query(tenantId, (tx) => budget.lines.map((line) => tx`
      insert into public.erp_budget_lines
        (tenant_id, budget_id, line_no, account, dimensions, amount_minor)
      values
        (${tenantId}::uuid, ${id}::uuid, ${line.line_no}, ${line.account},
         ${json(line.dimensions)}::jsonb, ${toMinor(line.amount, currency)}::bigint)
      on conflict (tenant_id, budget_id, line_no) do update set
        account = excluded.account,
        dimensions = excluded.dimensions,
        amount_minor = excluded.amount_minor
    `));
    return { ...budget, id };
  }

  /**
   * Compara un presupuesto contra los asientos derivados del libro `group`
   * del periodo. Nunca usa el libro local para no duplicar importes.
   */
  async function compareBudgetFor(tenantId, budget, options = {}) {
    const currency = currencyOf(options.currency || budget.currency);
    const { start, end } = periodBounds(budget.period);
    const dimensions = normalizeDimensions(options.dimensions);
    const rows = await query(tenantId, (tx) => tx`
      select l.value->>'account' as account,
             (l.value->>'debit')::float as debit,
             (l.value->>'credit')::float as credit,
             coalesce(l.value->'dimensions', '{}'::jsonb) as dimensions
      from public.erp_derived_entries d
      join public.erp_ledgers ledger
        on ledger.id = d.ledger_id and ledger.tenant_id = d.tenant_id
      cross join lateral jsonb_array_elements(d.lines) as l(value)
      where d.tenant_id = ${tenantId}::uuid
        and d.status = 'draft'
        and ledger.kind = 'group'
        and d.entry_date >= ${start}::date
        and d.entry_date < ${end}::date
    `);
    const actuals = rows.map((row) => ({
      account: row.account,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0,
      dimensions: row.dimensions || {},
    }));
    return compareBudget({ budget, actuals, dimensions, currency });
  }

  async function listCashPositions(tenantId, limit) {
    const rows = await query(tenantId, (tx) => tx`
      select id::text as id, entity_id::text as entity_id,
             position_date::text as position_date, currency::text as currency,
             opening_minor::float as opening_minor, inflow_minor::float as inflow_minor,
             outflow_minor::float as outflow_minor, closing_minor::float as closing_minor,
             movements, created_at
      from public.erp_cash_positions
      where tenant_id = ${tenantId}::uuid
      order by position_date desc, created_at desc
      limit ${clampLimit(limit)}::int
    `);
    return rows.map((row) => {
      const currency = String(row.currency).toUpperCase();
      return {
        ...row,
        opening: fromMinor(row.opening_minor, currency),
        inflow: fromMinor(row.inflow_minor, currency),
        outflow: fromMinor(row.outflow_minor, currency),
        closing: fromMinor(row.closing_minor, currency),
      };
    });
  }

  async function saveCashPosition(tenantId, input = {}) {
    const date = String(input.date || "").slice(0, 10);
    if (!DATE_RE.test(date)) throw fail(422, "La fecha debe tener formato YYYY-MM-DD");
    const currency = currencyOf(input.currency);
    const entityId = await resolveEntityId(tenantId, input.entityId);
    const computed = buildCashPosition({
      opening: input.opening ?? 0,
      movements: Array.isArray(input.movements) ? input.movements : [],
      currency,
      date,
    });
    const [row] = await query(tenantId, (tx) => tx`
      insert into public.erp_cash_positions
        (tenant_id, entity_id, position_date, currency,
         opening_minor, inflow_minor, outflow_minor, closing_minor, movements)
      values
        (${tenantId}::uuid, ${entityId}::uuid, ${date}::date, ${currency},
         ${toMinor(computed.opening, currency)}::bigint,
         ${toMinor(computed.inflow, currency)}::bigint,
         ${toMinor(computed.outflow, currency)}::bigint,
         ${toMinor(computed.closing, currency)}::bigint,
         ${json(input.movements || [])}::jsonb)
      on conflict (tenant_id, entity_id, position_date, currency) do update set
        opening_minor = excluded.opening_minor,
        inflow_minor = excluded.inflow_minor,
        outflow_minor = excluded.outflow_minor,
        closing_minor = excluded.closing_minor,
        movements = excluded.movements
      returning id::text as id
    `);
    return { id: row?.id || null, entity_id: entityId, ...computed };
  }

  async function listForecasts(tenantId, limit) {
    const rows = await query(tenantId, (tx) => tx`
      select id::text as id, entity_id::text as entity_id, period,
             currency::text as currency, method, basis,
             amount_minor::float as amount_minor, created_at
      from public.erp_forecasts
      where tenant_id = ${tenantId}::uuid
      order by period, created_at desc
      limit ${clampLimit(limit)}::int
    `);
    return rows.map((row) => ({
      ...row,
      amount: fromMinor(row.amount_minor, String(row.currency).toUpperCase()),
    }));
  }

  async function saveForecast(tenantId, input = {}) {
    const currency = currencyOf(input.currency);
    const entityId = await resolveEntityId(tenantId, input.entityId);
    const computed = buildForecast({
      actuals: Array.isArray(input.actuals) ? input.actuals : [],
      budget: input.budget || null,
      periods: input.periods ?? 3,
      method: input.method || "auto",
      currency,
    });
    await query(tenantId, (tx) => computed.periods.map((item) => tx`
      insert into public.erp_forecasts
        (tenant_id, entity_id, period, currency, method, amount_minor, basis)
      values
        (${tenantId}::uuid, ${entityId}::uuid, ${item.period}, ${currency},
         ${computed.method}, ${toMinor(item.amount, currency)}::bigint, ${item.basis})
      on conflict (tenant_id, entity_id, period, currency, method) do update set
        amount_minor = excluded.amount_minor,
        basis = excluded.basis
    `));
    return { entity_id: entityId, ...computed };
  }

  return {
    listBudgets,
    getBudget,
    saveBudget,
    compareBudgetFor,
    listCashPositions,
    saveCashPosition,
    listForecasts,
    saveForecast,
  };
}

export { accountingError };
