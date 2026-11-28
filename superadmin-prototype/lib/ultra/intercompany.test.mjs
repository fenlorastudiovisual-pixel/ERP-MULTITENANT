import test from "node:test";
import assert from "node:assert/strict";
import { buildEliminationEntry, definePair, matchIntercompany, normalizeTransaction } from "./intercompany.js";

const TENANT = "55555555-5555-5555-5555-555555555555";

function tx(overrides) {
  return normalizeTransaction({
    tenant_id: TENANT,
    source_type: "invoice",
    transaction_date: "2026-11-27",
    currency: "USD",
    ...overrides,
  });
}

test("definePair rechaza una entidad consigo misma", () => {
  assert.throws(() => definePair({ tenant_id: TENANT, entity_a: "e1", entity_b: "e1" }), /consigo misma/);
  assert.equal(definePair({ tenant_id: TENANT, entity_a: "e2", entity_b: "e1" }).pair_key, "e1::e2");
});

test("matchIntercompany empareja por clave y moneda y reporta roturas", () => {
  const result = matchIntercompany({
    transactions: [
      tx({ source_id: "FV-1", entity_id: "e1", counterparty_id: "e2", direction: "receivable", amount: 1000, match_key: "OC-1" }),
      tx({ source_id: "FC-1", entity_id: "e2", counterparty_id: "e1", direction: "payable", amount: 1000, match_key: "OC-1" }),
      tx({ source_id: "FV-2", entity_id: "e1", counterparty_id: "e2", direction: "receivable", amount: 500, match_key: "OC-2" }),
    ],
  });
  assert.equal(result.matched.length, 1);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.matched[0].difference_minor, 0);
});

test("la tolerancia se mide en unidades menores", () => {
  const result = matchIntercompany({
    tolerance_minor: 500,
    transactions: [
      tx({ source_id: "A", entity_id: "e1", counterparty_id: "e2", direction: "receivable", amount: 1000, match_key: "K" }),
      tx({ source_id: "B", entity_id: "e2", counterparty_id: "e1", direction: "payable", amount: 995, match_key: "K" }),
    ],
  });
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].difference_minor, 500);
});

test("buildEliminationEntry elimina ingresos/gastos y deja asiento balanceado", () => {
  const match = {
    pair_key: "e1::e2",
    currency: "USD",
    match_key: "K",
    receivable: { tenant_id: TENANT, amount: 1000 },
    payable: { tenant_id: TENANT, amount: 1000 },
  };
  const entry = buildEliminationEntry({ match, group_id: "g1", period: "2026-11-30" });
  assert.equal(entry.lines.length, 4);
  assert.equal(entry.total_debit, 200000);
  assert.equal(entry.total_credit, 200000);
  assert.equal(entry.lines[0].account, "ingresos_intercompania");
});

test("una diferencia intercompañía se cierra contra cuenta de diferencia", () => {
  const match = {
    pair_key: "e1::e2",
    currency: "USD",
    match_key: "K2",
    receivable: { tenant_id: TENANT, amount: 1000 },
    payable: { tenant_id: TENANT, amount: 990 },
  };
  const entry = buildEliminationEntry({ match, group_id: "g1", period: "2026-11-30" });
  assert.equal(entry.lines.length, 5);
  assert.equal(entry.lines[4].account, "diferencia_intercompania");
  assert.equal(entry.lines[4].debit, 10);
  assert.equal(entry.total_debit, entry.total_credit);
});
