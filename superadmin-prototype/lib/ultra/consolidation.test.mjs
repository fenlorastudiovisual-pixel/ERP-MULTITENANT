import test from "node:test";
import assert from "node:assert/strict";
import { activeMembers, addMember, buildCta, consolidateBalances, defineGroup, parentShare } from "./consolidation.js";

const TENANT = "44444444-4444-4444-4444-444444444444";
const DATE = "2026-11-27";
const GROUP = "group-1";

const group = defineGroup({ tenant_id: TENANT, code: "HOLDING", name: "Holding", reporting_currency: "COP" });
const members = [
  addMember({ tenant_id: TENANT, group_id: GROUP, entity_id: "e-us", ownership: 1, effective_from: "2026-01-01" }),
  addMember({ tenant_id: TENANT, group_id: GROUP, entity_id: "e-co", ownership: 0.8, effective_from: "2026-01-01" }),
  addMember({ tenant_id: TENANT, group_id: GROUP, entity_id: "e-old", ownership: 1, effective_from: "2025-01-01", effective_to: "2025-12-31" }),
];

const entries = [
  {
    tenant_id: TENANT,
    entity_id: "e-us",
    entry_date: DATE,
    currency: "USD",
    lines: [{ account: "ventas", debit: 100, credit: 100, dimensions: { entity: "e-us" } }],
  },
  {
    tenant_id: TENANT,
    entity_id: "e-co",
    entry_date: DATE,
    currency: "COP",
    lines: [{ account: "ventas", debit: 200, credit: 200, dimensions: { entity: "e-co" } }],
  },
];

const rates = [
  { from_currency: "USD", to_currency: "COP", rate_type: "closing", rate_date: "2026-11-01", rate: 4000 },
  { from_currency: "USD", to_currency: "COP", rate_type: "average", rate_date: "2026-11-01", rate: 3900 },
  { from_currency: "USD", to_currency: "COP", rate_type: "historical", rate_date: "2026-11-01", rate: 3800 },
];

test("activeMembers respeta vigencia", () => {
  assert.deepEqual(activeMembers(members, DATE).map((member) => member.entity_id), ["e-us", "e-co"]);
  assert.equal(group.reporting_currency, "COP");
});

test("parentShare separa matriz y participación no controladora", () => {
  const share = parentShare(1000, 0.8, "COP");
  assert.equal(share.parent, 800);
  assert.equal(share.nci, 200);
  assert.equal(share.parentMinor + share.nciMinor, 1000);
});

test("consolidateBalances traduce, agrega y cuadra", () => {
  const result = consolidateBalances({
    entries,
    members,
    groupCurrency: "COP",
    rates,
    date: DATE,
  });
  assert.deepEqual(result.entities.sort(), ["e-co", "e-us"]);
  assert.equal(result.total_debit, 400200);
  assert.equal(result.total_credit, 400200);
  assert.equal(result.lines[0].account, "ventas");
});

test("equityAccounts aplica ownership y deja la NCI fuera del saldo", () => {
  const result = consolidateBalances({
    entries: [{
      tenant_id: TENANT,
      entity_id: "e-co",
      entry_date: DATE,
      currency: "COP",
      lines: [{ account: "capital", debit: 1000, credit: 1000 }],
    }],
    members,
    groupCurrency: "COP",
    rates,
    date: DATE,
    equityAccounts: ["capital"],
  });
  assert.equal(result.total_debit, 800);
  assert.equal(result.total_credit, 800);
});

test("buildCta en VAL usa cierre para monetarios e histórico para no monetarios", () => {
  const cta = buildCta({
    monetary_assets: 1000,
    nonmonetary_assets: 500,
    monetary_liabilities: 300,
    nonmonetary_liabilities: 200,
    opening_equity: 800,
    net_income: 100,
    rates: { closing: 4000, average: 3900, historical: 3800 },
    from: "USD",
    to: "COP",
    method: "VAL",
  });
  assert.equal(cta.assets, 5900000);
  assert.equal(cta.liabilities, 1960000);
  assert.equal(cta.cta, 510000);
});
