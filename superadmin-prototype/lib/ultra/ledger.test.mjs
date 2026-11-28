import test from "node:test";
import assert from "node:assert/strict";
import { buildPostingPlan, defineLedger, definePostingRule, deriveEntry, selectRate, validatePostingPlan } from "./ledger.js";

const TENANT = "33333333-3333-3333-3333-333333333333";
const DATE = "2026-11-27";

function invoiceSource() {
  return {
    id: "FV-TEST-1",
    tenant_id: TENANT,
    source_type: "invoice",
    entry_date: DATE,
    currency: "COP",
    dimensions: { entity_id: "SAM" },
    lines: [
      { account: "clientes", debit: 1190, credit: 0 },
      { account: "ingresos", debit: 0, credit: 1000 },
      { account: "iva", debit: 0, credit: 190 },
    ],
  };
}

const local = defineLedger({ tenant_id: TENANT, code: "local", kind: "operational", currency: "COP", is_base: true });
const group = defineLedger({ tenant_id: TENANT, code: "group", kind: "group", currency: "USD" });

const localRule = definePostingRule({
  tenant_id: TENANT,
  code: "local-invoice",
  source_type: "invoice",
  ledger_id: "ledger-local",
});

const groupRule = definePostingRule({
  tenant_id: TENANT,
  code: "group-invoice",
  source_type: "invoice",
  ledger_id: "ledger-group",
  account_map: { clientes: "cobros_grupo", ingresos: "ventas_grupo", iva: "iva_grupo" },
  dimension_map: { report: "group" },
});

const rates = [
  { from_currency: "COP", to_currency: "USD", rate_type: "closing", rate_date: "2026-10-31", rate: 0.00024 },
  { from_currency: "COP", to_currency: "USD", rate_type: "closing", rate_date: "2026-11-01", rate: 0.00025 },
];

test("selectRate elige la tasa vigente más reciente y respeta rate_type", () => {
  assert.equal(selectRate(rates, { from: "COP", to: "USD", date: DATE, rate_type: "closing" }), 0.00025);
  assert.equal(selectRate(rates, { from: "COP", to: "COP", date: DATE }), 1);
  assert.throws(
    () => selectRate(rates, { from: "COP", to: "USD", date: DATE, rate_type: "historical" }),
    /Sin tasa historical/,
  );
});

test("deriveEntry deriva el libro local en COP sin alterar la operación", () => {
  const entry = deriveEntry({
    source: invoiceSource(),
    ledger: { ...local, id: "ledger-local" },
    rule: localRule,
  });
  assert.equal(entry.currency, "COP");
  assert.equal(entry.rate, 1);
  assert.equal(entry.total_debit, 1190);
  assert.equal(entry.total_credit, 1190);
  assert.equal(entry.lines[0].dimensions.entity_id, "SAM");
});

test("deriveEntry traduce a USD con redondeo en unidades menores", () => {
  const entry = deriveEntry({
    source: invoiceSource(),
    ledger: { ...group, id: "ledger-group" },
    rule: groupRule,
    rateBook: rates,
  });
  assert.equal(entry.currency, "USD");
  assert.equal(entry.rate, 0.00025);
  assert.equal(entry.lines[0].account, "cobros_grupo");
  assert.equal(entry.lines[0].dimensions.report, "group");
  assert.equal(entry.total_debit, entry.total_credit);
});

test("buildPostingPlan crea un asiento por ledger y valida el plan", () => {
  const plan = buildPostingPlan({
    source: invoiceSource(),
    ledgers: [{ ...local, id: "ledger-local" }, { ...group, id: "ledger-group" }],
    rules: [localRule, groupRule],
    rateBook: rates,
  });
  assert.equal(plan.entries.length, 2);
  assert.deepEqual(plan.entries.map((entry) => entry.ledger_code), ["local", "group"]);
  assert.equal(validatePostingPlan(plan).ok, true);
});

test("un plan con códigos duplicados o sin regla se rechaza", () => {
  assert.throws(
    () => buildPostingPlan({ source: invoiceSource(), ledgers: [local, local], rules: [] }),
    /duplicados/,
  );
  assert.throws(
    () => buildPostingPlan({ source: invoiceSource(), ledgers: [local], rules: [] }),
    /Sin regla activa/,
  );
});
