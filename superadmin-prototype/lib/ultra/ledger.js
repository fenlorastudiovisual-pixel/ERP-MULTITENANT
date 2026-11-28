// Libros paralelos y derivación contable.
// Una operación operativa permanece intacta; cada ledger obtiene su propia
// versión derivada mediante reglas declarativas auditables.

import { assertBalanced, fromMinor, scaleFor, toMinor } from "./money.js";

export const LEDGER_KINDS = Object.freeze([
  "operational",
  "group",
  "statutory",
  "fiscal",
  "budget",
]);

export const RATE_TYPES = Object.freeze(["spot", "closing", "average", "historical"]);

const normalize = (value, label) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) throw new Error(`${label} requerido`);
  return text;
};

export function defineLedger({
  tenant_id,
  entity_id = null,
  code,
  kind,
  currency = "COP",
  is_base = false,
  fiscal_year_start = null,
  metadata = {},
} = {}) {
  if (!tenant_id) throw new Error("defineLedger: tenant_id requerido");
  if (!LEDGER_KINDS.includes(kind)) throw new Error(`kind de ledger inválido: ${kind}`);
  return Object.freeze({
    id: null,
    tenant_id,
    entity_id,
    code: normalize(code, "code"),
    kind,
    currency: String(currency).toUpperCase(),
    is_base,
    fiscal_year_start,
    metadata,
    status: "active",
  });
}

export function definePostingRule({
  tenant_id,
  code,
  source_type,
  ledger_id,
  account_map = {},
  dimension_map = {},
  rounding_account = "rounding_difference",
  priority = 100,
  active = true,
} = {}) {
  if (!tenant_id || !ledger_id) throw new Error("definePostingRule: tenant_id y ledger_id requeridos");
  return Object.freeze({
    id: null,
    tenant_id,
    code: normalize(code, "code"),
    source_type: normalize(source_type, "source_type"),
    ledger_id,
    account_map: { ...account_map },
    dimension_map: { ...dimension_map },
    rounding_account: normalize(rounding_account, "rounding_account"),
    priority,
    active,
  });
}

/** Elige la tasa vigente más reciente <= fecha. from === to siempre vale 1. */
export function selectRate(rateBook = [], { from, to, date, rate_type = "closing" } = {}) {
  const fromCode = String(from || "").toUpperCase();
  const toCode = String(to || "").toUpperCase();
  if (fromCode === toCode) return 1;

  if (!RATE_TYPES.includes(rate_type)) throw new Error(`Tipo de tasa inválido: ${rate_type}`);
  const day = String(date || "").slice(0, 10);
  if (!day) throw new Error("selectRate: fecha requerida");

  const candidates = rateBook
    .filter((row) =>
      String(row.from_currency).toUpperCase() === fromCode
      && String(row.to_currency).toUpperCase() === toCode
      && row.rate_type === rate_type
      && String(row.rate_date).slice(0, 10) <= day,
    )
    .sort((a, b) => String(b.rate_date).localeCompare(String(a.rate_date)));

  if (!candidates.length) {
    throw new Error(`Sin tasa ${rate_type} ${fromCode}→${toCode} vigente en ${day}`);
  }
  return Number(candidates[0].rate);
}

/** Convierte respetando unidades menores de ambas monedas. */
export function convertAmount(amount, fromCurrency, toCurrency, rate = 1) {
  const from = String(fromCurrency || "COP").toUpperCase();
  const to = String(toCurrency || "COP").toUpperCase();
  if (!Number.isFinite(Number(rate)) || Number(rate) <= 0) throw new Error("Tasa de cambio inválida");

  const sourceMinor = toMinor(amount, from);
  if (from === to) return fromMinor(sourceMinor, to);

  const sourceMajor = sourceMinor / 10 ** scaleFor(from);
  const targetMinor = Math.round(sourceMajor * Number(rate) * 10 ** scaleFor(to));
  return fromMinor(targetMinor, to);
}

function targetMinor(amount, sourceCurrency, targetCurrency, rate) {
  const from = String(sourceCurrency || "COP").toUpperCase();
  const to = String(targetCurrency || "COP").toUpperCase();
  const sourceMinor = toMinor(amount, from);
  if (from === to) return sourceMinor;
  const sourceMajor = sourceMinor / 10 ** scaleFor(from);
  return Math.round(sourceMajor * Number(rate) * 10 ** scaleFor(to));
}

/** Deriva un asiento para un ledger concreto sin mutar la operación origen. */
export function deriveEntry({ source, ledger, rule, rateBook = [], rate_type = "closing" } = {}) {
  if (!source || !ledger || !rule) throw new Error("deriveEntry: source, ledger y rule requeridos");
  if (rule.source_type !== source.source_type) {
    throw new Error(`Regla ${rule.code} no aplica a ${source.source_type}`);
  }
  if (!Array.isArray(source.lines) || !source.lines.length) {
    throw new Error(`Operación ${source.id || ""} sin líneas`);
  }

  const rate = selectRate(rateBook, {
    from: source.currency,
    to: ledger.currency,
    date: source.entry_date,
    rate_type,
  });

  const accountMap = rule.account_map || {};
  const dimensionMap = rule.dimension_map || {};
  const buckets = new Map();

  for (const line of source.lines) {
    const account = accountMap[line.account] || line.account;
    const dimensions = {
      ...(source.dimensions || {}),
      ...(line.dimensions || {}),
      ...dimensionMap,
    };
    const key = JSON.stringify([account, dimensions]);
    const bucket = buckets.get(key) || {
      account,
      dimensions,
      debitMinor: 0,
      creditMinor: 0,
    };

    bucket.debitMinor += targetMinor(line.debit || 0, source.currency, ledger.currency, rate);
    bucket.creditMinor += targetMinor(line.credit || 0, source.currency, ledger.currency, rate);
    buckets.set(key, bucket);
  }

  const lines = [...buckets.values()].map((bucket) => ({
    account: bucket.account,
    dimensions: bucket.dimensions,
    debit: fromMinor(bucket.debitMinor, ledger.currency),
    credit: fromMinor(bucket.creditMinor, ledger.currency),
  }));

  // Cada línea se convierte por separado; el redondeo puede dejar una
  // diferencia de una unidad menor. Se cierra en una cuenta explícita,
  // nunca repartiendo centavos silenciosamente entre cuentas reales.
  const debitMinor = lines.reduce((sum, line) => sum + toMinor(line.debit, ledger.currency), 0);
  const creditMinor = lines.reduce((sum, line) => sum + toMinor(line.credit, ledger.currency), 0);
  if (debitMinor !== creditMinor) {
    const difference = Math.abs(debitMinor - creditMinor);
    lines.push({
      account: rule.rounding_account || "rounding_difference",
      dimensions: { ...(source.dimensions || {}), ...dimensionMap },
      debit: fromMinor(debitMinor < creditMinor ? difference : 0, ledger.currency),
      credit: fromMinor(debitMinor > creditMinor ? difference : 0, ledger.currency),
    });
  }

  assertBalanced(lines, ledger.currency);

  return {
    tenant_id: source.tenant_id,
    source_type: source.source_type,
    source_id: String(source.id),
    ledger_id: ledger.id,
    ledger_code: ledger.code,
    ledger_kind: ledger.kind,
    rule_id: rule.id,
    rule_code: rule.code,
    entry_date: source.entry_date,
    currency: ledger.currency,
    rate,
    rate_type,
    lines,
    total_debit: lines.reduce((sum, line) => sum + toMinor(line.debit, ledger.currency), 0),
    total_credit: lines.reduce((sum, line) => sum + toMinor(line.credit, ledger.currency), 0),
    status: "draft",
  };
}

/** Plan completo: una operación → un asiento derivado por ledger. */
export function buildPostingPlan({ source, ledgers = [], rules = [], rateBook = [], rate_type = "closing" } = {}) {
  if (!source) throw new Error("buildPostingPlan: source requerido");

  const codes = ledgers.map((ledger) => ledger.code);
  if (new Set(codes).size !== codes.length) throw new Error("Códigos de ledger duplicados");

  const entries = ledgers.map((ledger) => {
    const rule = rules
      .filter((item) =>
        item.ledger_id === ledger.id
        && item.source_type === source.source_type
        && item.active !== false,
      )
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0];

    if (!rule) throw new Error(`Sin regla activa para ${source.source_type} en ledger ${ledger.code}`);
    return deriveEntry({ source, ledger, rule, rateBook, rate_type });
  });

  return {
    tenant_id: source.tenant_id,
    source_type: source.source_type,
    source_id: String(source.id),
    entries,
  };
}

export function validatePostingPlan(plan) {
  if (!plan || !Array.isArray(plan.entries)) throw new Error("Plan de asientos inválido");
  for (const entry of plan.entries) assertBalanced(entry.lines, entry.currency);
  return { ok: true, ledgers: plan.entries.length };
}
