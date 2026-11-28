// EPM y tesorería: presupuesto vs. real, reportes por dimensión, posición de
// caja y previsión. Todo se calcula en unidades menores para no perder centavos.
// Es un motor puro: no consulta la BD ni decide permisos.

import { toMinor, fromMinor } from "./money.js";

const PERIOD_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

export function normalizeDimensions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null || item === "") continue;
    output[key] = String(item);
  }
  return Object.fromEntries(Object.entries(output).sort(([a], [b]) => a.localeCompare(b)));
}

/** Clave estable para agrupar por cuenta + dimensiones. */
export function budgetKey(account, dimensions = {}) {
  return `${String(account)}|${JSON.stringify(normalizeDimensions(dimensions))}`;
}

function matches(dimensions, filter) {
  return Object.entries(normalizeDimensions(filter)).every(
    ([key, value]) => String(dimensions?.[key]) === value,
  );
}

function lineMinor(line, currency) {
  const netMinor = toMinor(line.credit ?? 0, currency) - toMinor(line.debit ?? 0, currency);
  return { debitMinor: toMinor(line.debit ?? 0, currency), creditMinor: toMinor(line.credit ?? 0, currency), netMinor };
}

/**
 * Presupuesto declarativo. `lines` son { account, amount, dimensions }.
 * `period` es YYYY-MM. El currency define las unidades menores.
 */
export function defineBudget({
  tenant_id,
  code,
  name,
  period,
  currency = "COP",
  entity_id = null,
  dimensions = {},
  lines = [],
  status = "draft",
} = {}) {
  if (!tenant_id || !code || !name) throw fail("defineBudget: tenant_id, code y name requeridos");
  if (!PERIOD_RE.test(String(period || ""))) throw fail("El periodo debe tener formato YYYY-MM");
  if (!Array.isArray(lines) || !lines.length) throw fail("El presupuesto requiere líneas");
  if (!["draft", "approved", "closed"].includes(String(status))) throw fail(`Estado inválido: ${status}`);

  return Object.freeze({
    id: null,
    tenant_id,
    code: String(code),
    name: String(name),
    period: String(period),
    currency: String(currency).toUpperCase(),
    entity_id,
    dimensions: normalizeDimensions(dimensions),
    lines: Object.freeze(lines.map((line, index) => {
      if (!line?.account) throw fail(`Línea ${index + 1} sin account`);
      return Object.freeze({
        line_no: index + 1,
        account: String(line.account),
        dimensions: normalizeDimensions(line.dimensions),
        // Se guarda en unidades mayores ya normalizadas a la precisión de la
        // moneda; compareBudget convierte a la moneda de reporte vía unidades
        // menores. Guardar minor aquí duplicaría la escala en USD/EUR.
        amount: fromMinor(toMinor(line.amount ?? 0, currency), currency),
      });
    })),
    status: String(status),
  });
}

/**
 * Compara presupuesto contra asientos derivados. `actuals` son líneas con
 * { account, debit, credit, dimensions }. El real neto es crédito − débito.
 */
export function compareBudget({ budget, actuals = [], dimensions = {}, currency } = {}) {
  if (!budget) throw fail("compareBudget: budget requerido");
  const curr = String(currency || budget.currency || "COP").toUpperCase();
  const budgetCurrency = String(budget.currency || "COP").toUpperCase();
  if (budgetCurrency !== curr) {
    throw fail(`compareBudget: la moneda del presupuesto (${budgetCurrency}) debe igualar la de reporte (${curr}); convierte antes con tasas reales`);
  }

  const budgetMap = new Map();
  for (const line of budget.lines || []) {
    if (!matches(line.dimensions, dimensions)) continue;
    const key = budgetKey(line.account, line.dimensions);
    const prior = budgetMap.get(key) || { account: line.account, dimensions: line.dimensions, budgetMinor: 0 };
    prior.budgetMinor += toMinor(line.amount, curr);
    budgetMap.set(key, prior);
  }

  const actualMap = new Map();
  for (const line of actuals) {
    if (!matches(line.dimensions, dimensions)) continue;
    const key = budgetKey(line.account, line.dimensions);
    const netMinor = lineMinor(line, curr).netMinor;
    const prior = actualMap.get(key) || { account: line.account, dimensions: line.dimensions, actualMinor: 0 };
    prior.actualMinor += netMinor;
    actualMap.set(key, prior);
  }

  const keys = [...new Set([...budgetMap.keys(), ...actualMap.keys()])].sort();
  const rows = keys.map((key) => {
    const planned = budgetMap.get(key);
    const real = actualMap.get(key);
    const budgetMinor = planned?.budgetMinor || 0;
    const actualMinor = real?.actualMinor || 0;
    const varianceMinor = actualMinor - budgetMinor;
    return {
      account: (planned || real).account,
      dimensions: (planned || real).dimensions,
      budget: fromMinor(budgetMinor, curr),
      actual: fromMinor(actualMinor, curr),
      variance: fromMinor(varianceMinor, curr),
      variancePct: budgetMinor === 0 ? null : Number((varianceMinor / budgetMinor * 100).toFixed(2)),
    };
  });

  const budgetMinor = rows.reduce((sum, row) => sum + toMinor(row.budget, curr), 0);
  const actualMinor = rows.reduce((sum, row) => sum + toMinor(row.actual, curr), 0);
  return {
    currency: curr,
    period: budget.period,
    dimensions: normalizeDimensions(dimensions),
    rows,
    totals: {
      budget: fromMinor(budgetMinor, curr),
      actual: fromMinor(actualMinor, curr),
      variance: fromMinor(actualMinor - budgetMinor, curr),
    },
  };
}

/** Agrega líneas de asientos por las dimensiones solicitadas. */
export function dimensionReport({ entries = [], dimensions = ["entity", "cost_center"], currency = "COP" } = {}) {
  const selected = (Array.isArray(dimensions) ? dimensions : []).map(String);
  const buckets = new Map();

  for (const entry of entries) {
    for (const line of entry.lines || []) {
      const dims = normalizeDimensions(line.dimensions);
      const key = JSON.stringify(selected.map((name) => [name, dims[name] ?? null]));
      const bucket = buckets.get(key) || {
        dimensions: Object.fromEntries(selected.filter((name) => dims[name] !== undefined).map((name) => [name, dims[name]])),
        debitMinor: 0,
        creditMinor: 0,
        netMinor: 0,
      };
      const amounts = lineMinor(line, currency);
      bucket.debitMinor += amounts.debitMinor;
      bucket.creditMinor += amounts.creditMinor;
      bucket.netMinor += amounts.netMinor;
      buckets.set(key, bucket);
    }
  }

  const rows = [...buckets.values()]
    .map((bucket) => ({
      dimensions: bucket.dimensions,
      debit: fromMinor(bucket.debitMinor, currency),
      credit: fromMinor(bucket.creditMinor, currency),
      net: fromMinor(bucket.netMinor, currency),
    }))
    .sort((a, b) => JSON.stringify(a.dimensions).localeCompare(JSON.stringify(b.dimensions)));

  const netMinor = toMinor(rows.reduce((sum, row) => sum + row.net, 0), currency);
  return { currency, dimensions: selected, rows, total_net: fromMinor(netMinor, currency) };
}

/** Posición de caja: opening + entradas − salidas. */
export function buildCashPosition({ opening = 0, movements = [], currency = "COP", date } = {}) {
  if (date && !DATE_RE.test(String(date))) throw fail("La fecha debe tener formato YYYY-MM-DD");
  const buckets = new Map();
  let inMinor = 0;
  let outMinor = 0;

  for (const movement of movements) {
    const direction = String(movement.direction || "").toLowerCase();
    if (!["in", "out"].includes(direction)) throw fail(`Dirección de caja inválida: ${direction}`);
    const amountMinor = toMinor(movement.amount ?? 0, currency);
    if (amountMinor < 0) throw fail("Los movimientos de caja no pueden ser negativos");
    const category = String(movement.category || "otros");
    const bucket = buckets.get(category) || { category, inMinor: 0, outMinor: 0 };
    if (direction === "in") {
      inMinor += amountMinor;
      bucket.inMinor += amountMinor;
    } else {
      outMinor += amountMinor;
      bucket.outMinor += amountMinor;
    }
    buckets.set(category, bucket);
  }

  const openingMinor = toMinor(opening, currency);
  const byCategory = [...buckets.values()].map((bucket) => ({
    category: bucket.category,
    inflow: fromMinor(bucket.inMinor, currency),
    outflow: fromMinor(bucket.outMinor, currency),
    net: fromMinor(bucket.inMinor - bucket.outMinor, currency),
  })).sort((a, b) => a.category.localeCompare(b.category));

  return {
    currency,
    date: date || null,
    opening: fromMinor(openingMinor, currency),
    inflow: fromMinor(inMinor, currency),
    outflow: fromMinor(outMinor, currency),
    closing: fromMinor(openingMinor + inMinor - outMinor, currency),
    byCategory,
  };
}

function nextPeriod(period, offset) {
  const [year, month] = String(period).split("-").map(Number);
  const total = year * 12 + (month - 1) + offset;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String(total % 12 + 1).padStart(2, "0")}`;
}

/**
 * Previsión simple y auditable: con presupuesto se proyecta ese importe; sin él,
 * se usa el promedio de los reales disponibles. Nunca inventa estacionalidad.
 */
export function buildForecast({ actuals = [], budget = null, periods = 3, method = "auto", currency = "COP" } = {}) {
  const count = Number(periods);
  if (!Number.isInteger(count) || count < 1 || count > 36) throw fail("periods debe estar entre 1 y 36");
  const sorted = [...actuals].sort((a, b) => String(a.period).localeCompare(String(b.period)));
  for (const item of sorted) {
    if (!PERIOD_RE.test(String(item.period || ""))) throw fail("Los periodos reales deben ser YYYY-MM");
  }
  const lastPeriod = sorted.at(-1)?.period;
  if (!lastPeriod) throw fail("Se requiere al menos un periodo real");

  const recent = sorted.slice(-3);
  const averageMinor = recent.length
    ? Math.round(recent.reduce((sum, item) => sum + toMinor(item.amount ?? 0, currency), 0) / recent.length)
    : 0;
  const budgetMinor = budget ? toMinor(budget.amount ?? 0, currency) : null;
  const chosen = method === "budget" && budgetMinor !== null ? budgetMinor : averageMinor;
  const basis = method === "budget" && budgetMinor !== null ? "budget" : "recent_average";

  return {
    currency,
    method: basis,
    periods: Array.from({ length: count }, (_, index) => ({
      period: nextPeriod(lastPeriod, index + 1),
      amount: fromMinor(chosen, currency),
      basis,
    })),
  };
}
