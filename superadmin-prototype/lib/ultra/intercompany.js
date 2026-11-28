// Conciliación intercompañía y eliminaciones.
// El matching es determinista por par + moneda + clave; la tolerancia se mide
// en unidades menores para no depender de decimales de la moneda.

import { assertBalanced, fromMinor, toMinor } from "./money.js";

export function pairKey(a, b) {
  return [String(a), String(b)].sort().join("::");
}

export function definePair({ tenant_id, entity_a, entity_b, tolerance_minor = 0, settlement_days = 30 } = {}) {
  if (!tenant_id || !entity_a || !entity_b) throw new Error("definePair: entidades requeridas");
  if (entity_a === entity_b) throw new Error("Una entidad no puede operar consigo misma");
  return Object.freeze({
    id: null,
    tenant_id,
    entity_a,
    entity_b,
    pair_key: pairKey(entity_a, entity_b),
    tolerance_minor: Math.max(0, Number(tolerance_minor) || 0),
    settlement_days,
    status: "active",
  });
}

export function normalizeTransaction(transaction = {}) {
  const { direction, amount, currency = "COP", entity_id, counterparty_id } = transaction;
  if (!["receivable", "payable"].includes(direction)) throw new Error(`Dirección inválida: ${direction}`);
  if (!entity_id || !counterparty_id) throw new Error("Transacción IC sin entidades");
  if (!(Number(amount) > 0)) throw new Error("Monto IC debe ser positivo");
  return {
    ...transaction,
    currency: String(currency).toUpperCase(),
    amount_minor: toMinor(amount, currency),
    match_key: String(transaction.match_key || "").trim(),
  };
}

/** Greedy determinista: empareja por clave y tolerancia, ordenando por fecha y monto. */
export function matchIntercompany({ transactions = [], tolerance_minor = 0 } = {}) {
  const buckets = new Map();

  for (const raw of transactions) {
    const tx = normalizeTransaction(raw);
    const key = [pairKey(tx.entity_id, tx.counterparty_id), tx.currency, tx.match_key].join("::");
    const bucket = buckets.get(key) || { pair_key: pairKey(tx.entity_id, tx.counterparty_id), currency: tx.currency, match_key: tx.match_key, receivable: [], payable: [] };
    bucket[tx.direction].push(tx);
    buckets.set(key, bucket);
  }

  const matched = [];
  const unmatched = [];

  for (const bucket of buckets.values()) {
    const receivables = bucket.receivable.sort((a, b) => String(a.transaction_date || "").localeCompare(String(b.transaction_date || "")) || a.amount_minor - b.amount_minor);
    const payables = bucket.payable.sort((a, b) => String(a.transaction_date || "").localeCompare(String(b.transaction_date || "")) || a.amount_minor - b.amount_minor);

    const tolerance = Math.max(tolerance_minor, ...[...receivables, ...payables].map((tx) => tx.tolerance_minor || 0));

    let r = 0;
    let p = 0;
    while (r < receivables.length && p < payables.length) {
      const receivable = receivables[r];
      const payable = payables[p];
      const difference = Math.abs(receivable.amount_minor - payable.amount_minor);
      if (difference <= tolerance) {
        matched.push({
          pair_key: bucket.pair_key,
          currency: bucket.currency,
          match_key: bucket.match_key,
          receivable,
          payable,
          difference_minor: difference,
        });
        r += 1;
        p += 1;
      } else if (receivable.amount_minor < payable.amount_minor) {
        unmatched.push({ ...receivable, reason: "sin_contraparte" });
        r += 1;
      } else {
        unmatched.push({ ...payable, reason: "sin_contraparte" });
        p += 1;
      }
    }

    while (r < receivables.length) unmatched.push({ ...receivables[r++], reason: "sin_contraparte" });
    while (p < payables.length) unmatched.push({ ...payables[p++], reason: "sin_contraparte" });
  }

  return { matched, unmatched };
}

/**
 * Eliminación revenue↔expense y receivable↔payable.
 * Si los importes no son idénticos, la diferencia se cierra contra
 * `difference_account` para que el asiento nunca quede desbalanceado.
 */
export function buildEliminationEntry({
  match,
  group_id,
  period,
  rule_id = null,
  currency,
  accounts = {},
} = {}) {
  if (!match || !group_id || !period) throw new Error("buildEliminationEntry: match, group_id y period requeridos");

  const code = String(currency || match.currency || "COP").toUpperCase();
  const names = {
    revenue: accounts.revenue || "ingresos_intercompania",
    expense: accounts.expense || "costos_intercompania",
    receivable: accounts.receivable || "cuentas_por_cobrar_ic",
    payable: accounts.payable || "cuentas_por_pagar_ic",
    difference: accounts.difference || "diferencia_intercompania",
  };

  const receivableMinor = toMinor(match.receivable?.amount ?? match.amount ?? 0, code);
  const payableMinor = toMinor(match.payable?.amount ?? match.amount ?? 0, code);
  const amountMinor = Math.min(receivableMinor, payableMinor);
  const differenceMinor = Math.abs(receivableMinor - payableMinor);
  const dimensions = { intercompany_pair: match.pair_key };

  // revenue/expense se eliminan por el importe coincidente; receivable/payable
  // se eliminan por su importe íntegro. La diferencia se cierra en una línea
  // adicional para que el asiento cuadre siempre.
  const lines = [
    { account: names.revenue, dimensions, debit: fromMinor(amountMinor, code), credit: 0 },
    { account: names.expense, dimensions, debit: 0, credit: fromMinor(amountMinor, code) },
    { account: names.payable, dimensions, debit: fromMinor(payableMinor, code), credit: 0 },
    { account: names.receivable, dimensions, debit: 0, credit: fromMinor(receivableMinor, code) },
  ];

  if (differenceMinor) {
    const line = {
      account: names.difference,
      dimensions,
      debit: 0,
      credit: 0,
    };
    if (receivableMinor > payableMinor) line.debit = fromMinor(differenceMinor, code);
    else line.credit = fromMinor(differenceMinor, code);
    lines.push(line);
  }

  assertBalanced(lines, code);

  return {
    tenant_id: match.receivable?.tenant_id || match.payable?.tenant_id || null,
    group_id,
    period: String(period).slice(0, 10),
    rule_id,
    match_key: match.match_key || `${match.pair_key}:${code}`,
    currency: code,
    lines,
    total_debit: lines.reduce((sum, line) => sum + toMinor(line.debit, code), 0),
    total_credit: lines.reduce((sum, line) => sum + toMinor(line.credit, code), 0),
    status: "draft",
  };
}
