// Consolidación de grupo: memberships con vigencia, CTA, participación no controladora
// y agregación por cuenta con eliminaciones ya resueltas.

import { assertBalanced, fromMinor, toMinor } from "./money.js";
import { convertAmount } from "./ledger.js";

export const CONSOLIDATION_METHODS = Object.freeze([
  "full",
  "equity",
  "proportional",
  "majority",
  "minority",
]);

export function defineGroup({
  tenant_id,
  code,
  name,
  parent_group_id = null,
  reporting_currency = "COP",
  method = "full",
} = {}) {
  if (!tenant_id || !code || !name) throw new Error("defineGroup: tenant_id, code y name requeridos");
  if (!CONSOLIDATION_METHODS.includes(method)) throw new Error(`Método inválido: ${method}`);
  return Object.freeze({
    id: null,
    tenant_id,
    code: String(code).trim().toUpperCase(),
    name,
    parent_group_id,
    reporting_currency: String(reporting_currency).toUpperCase(),
    method,
    status: "active",
  });
}

export function addMember({
  tenant_id,
  group_id,
  entity_id,
  ownership = 1,
  effective_from,
  effective_to = null,
  method = "full",
} = {}) {
  if (!tenant_id || !group_id || !entity_id || !effective_from) {
    throw new Error("addMember: tenant_id, group_id, entity_id y effective_from requeridos");
  }
  const share = Number(ownership);
  if (!Number.isFinite(share) || share < 0 || share > 1) {
    throw new Error(`Participación inválida: ${ownership}`);
  }
  if (!CONSOLIDATION_METHODS.includes(method)) throw new Error(`Método inválido: ${method}`);
  return Object.freeze({
    tenant_id,
    group_id,
    entity_id,
    ownership: share,
    effective_from: String(effective_from).slice(0, 10),
    effective_to: effective_to ? String(effective_to).slice(0, 10) : null,
    method,
  });
}

export function activeMembers(members = [], date) {
  const day = String(date || "").slice(0, 10);
  if (!day) throw new Error("activeMembers: fecha requerida");
  return members.filter((member) =>
    String(member.effective_from).slice(0, 10) <= day
    && (!member.effective_to || String(member.effective_to).slice(0, 10) >= day),
  );
}

/** Parte un importe entre la matriz y la participación no controladora. */
export function parentShare(amount, ownership = 1, currency = "COP") {
  const share = Number(ownership);
  if (!Number.isFinite(share) || share < 0 || share > 1) throw new Error("Participación inválida");
  const totalMinor = toMinor(amount, currency);
  const parentMinor = Math.round(totalMinor * share);
  return {
    currency,
    ownership: share,
    parent: fromMinor(parentMinor, currency),
    nci: fromMinor(totalMinor - parentMinor, currency),
    parentMinor,
    nciMinor: totalMinor - parentMinor,
  };
}

/**
 * CTA. PVA traduce activos/passivos a cierre; VAL usa cierre para monetarios
 * e histórico para no monetarios. El patrimonio siempre va a histórico.
 */
export function buildCta({
  monetary_assets = 0,
  nonmonetary_assets = 0,
  monetary_liabilities = 0,
  nonmonetary_liabilities = 0,
  opening_equity = 0,
  net_income = 0,
  rates = {},
  from,
  to,
  method = "PVA",
} = {}) {
  if (!["PVA", "VAL"].includes(method)) throw new Error(`Método CTA inválido: ${method}`);
  const closing = Number(rates.closing);
  const average = Number(rates.average ?? rates.closing);
  const historical = Number(rates.historical ?? rates.closing);
  if (![closing, average, historical].every((rate) => Number.isFinite(rate) && rate > 0)) {
    throw new Error("buildCta: tasas inválidas");
  }

  const assetRate = method === "PVA" ? closing : historical;
  const liabilityRate = method === "PVA" ? closing : historical;

  const assets = convertAmount(monetary_assets, from, to, method === "VAL" ? closing : assetRate)
    + convertAmount(nonmonetary_assets, from, to, assetRate);
  const liabilities = convertAmount(monetary_liabilities, from, to, method === "VAL" ? closing : liabilityRate)
    + convertAmount(nonmonetary_liabilities, from, to, liabilityRate);
  const equity = convertAmount(opening_equity, from, to, historical);
  const profit = convertAmount(net_income, from, to, average);

  const cta = Number((assets - liabilities - equity - profit).toFixed(scale(to)));
  return {
    method,
    currency: String(to).toUpperCase(),
    assets,
    liabilities,
    equity,
    profit,
    cta,
  };
}

function scale(currency) {
  return ["COP", "CLP"].includes(String(currency).toUpperCase()) ? 0 : 2;
}

/**
 * Agrega asientos de varios libros a la moneda de reporte y aplica eliminaciones.
 * `equityAccounts` recibe el prorrateo por ownership; el resto se agrega íntegro.
 */
export function consolidateBalances({
  entries = [],
  members = [],
  groupCurrency = "COP",
  rates = [],
  date,
  rate_type = "closing",
  eliminations = [],
  equityAccounts = [],
} = {}) {
  const active = new Map(activeMembers(members, date).map((member) => [member.entity_id, member]));
  const buckets = new Map();

  const addLine = (line, accountCurrency, rate = 1, ownership = 1) => {
    const key = JSON.stringify([line.account, line.dimensions || {}]);
    const bucket = buckets.get(key) || {
      account: line.account,
      dimensions: line.dimensions || {},
      debitMinor: 0,
      creditMinor: 0,
    };

    const factor = equityAccounts.includes(line.account) ? Number(ownership) : 1;
    bucket.debitMinor += Math.round(
      toMinor(convertAmount(line.debit || 0, accountCurrency, groupCurrency, rate), groupCurrency) * factor,
    );
    bucket.creditMinor += Math.round(
      toMinor(convertAmount(line.credit || 0, accountCurrency, groupCurrency, rate), groupCurrency) * factor,
    );
    buckets.set(key, bucket);
  };

  for (const entry of entries) {
    const member = active.get(entry.entity_id);
    if (!member) continue;
    const rate = entry.rate && entry.currency === groupCurrency
      ? Number(entry.rate)
      : selectGroupRate(rates, entry.currency, groupCurrency, entry.entry_date || date, rate_type);
    for (const line of entry.lines || []) {
      addLine(line, entry.currency || groupCurrency, rate, member.ownership);
    }
  }

  for (const elimination of eliminations) {
    for (const line of elimination.lines || []) addLine(line, groupCurrency, 1, 1);
  }

  const lines = [...buckets.values()]
    .filter((bucket) => bucket.debitMinor !== 0 || bucket.creditMinor !== 0)
    .map((bucket) => ({
      account: bucket.account,
      dimensions: bucket.dimensions,
      debit: fromMinor(bucket.debitMinor, groupCurrency),
      credit: fromMinor(bucket.creditMinor, groupCurrency),
    }));

  assertBalanced(lines, groupCurrency);

  return {
    currency: groupCurrency,
    date: String(date).slice(0, 10),
    entities: [...active.keys()],
    lines,
    total_debit: lines.reduce((sum, line) => sum + toMinor(line.debit, groupCurrency), 0),
    total_credit: lines.reduce((sum, line) => sum + toMinor(line.credit, groupCurrency), 0),
  };
}

function selectGroupRate(rateBook, from, to, date, rate_type) {
  const source = String(from || "").toUpperCase();
  const target = String(to || "").toUpperCase();
  if (source === target) return 1;
  const day = String(date || "").slice(0, 10);
  const found = rateBook
    .filter((row) =>
      String(row.from_currency).toUpperCase() === source
      && String(row.to_currency).toUpperCase() === target
      && row.rate_type === rate_type
      && String(row.rate_date).slice(0, 10) <= day,
    )
    .sort((a, b) => String(b.rate_date).localeCompare(String(a.rate_date)))[0];
  if (!found) throw new Error(`Sin tasa ${rate_type} ${source}→${target} en ${day}`);
  return Number(found.rate);
}
