import test from "node:test";
import assert from "node:assert/strict";
import {
  accountingError,
  buildConsolidationReport,
  createAccountingService,
  derivePostingPlan,
} from "./accounting-service.js";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEDGER_LOCAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEDGER_GROUP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SOURCE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const GROUP_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DATE = "2026-11-27";

function tag(strings, ...values) {
  return { text: strings.join("?"), values };
}

function fakeRunner(responder, calls) {
  return (tenantId, build, role, actorId) => {
    const built = build(tag);
    calls.push({ tenantId, built, role, actorId });
    return responder(built, tenantId);
  };
}

function baseResponder(overrides = {}) {
  return (built) => {
    const respond = (query) => {
      const text = query.text;
      if (text.includes("insert into public.erp_derived_entries")) {
        return [{ id: "inserted", ledger_id: String(query.values[3]) }];
      }
      if (text.includes("from public.journal_entries je")) return overrides.source ? [overrides.source] : [];
      if (text.includes("from public.erp_ledgers")) return overrides.ledgers || [];
      if (text.includes("from public.erp_posting_rules")) return overrides.rules || [];
      if (text.includes("from public.erp_currency_rates")) return overrides.rates || [];
      if (text.includes("from public.erp_consolidation_groups")) {
        return text.includes("code =") && overrides.group ? [overrides.group]
          : text.includes("order by code") ? (overrides.groups || []) : [];
      }
      if (text.includes("from public.erp_consolidation_members")) return overrides.members || [];
      if (text.includes("from public.erp_derived_entries")) return overrides.entries || [];
      if (text.includes("from public.erp_elimination_entries")) return overrides.eliminations || [];
      return [];
    };
    return Array.isArray(built) ? built.map(respond) : respond(built);
  };
}

const source = {
  id: SOURCE_ID,
  entry_date: DATE,
  source_type: "invoice",
  source_document_id: "11111111-1111-4111-8111-111111111111",
  description: "Factura de prueba",
  currency: "COP",
  lines: [
    { account: "1305", debit: 1190, credit: 0, dimensions: { partner_id: "p1" } },
    { account: "4135", debit: 0, credit: 1000, dimensions: { partner_id: "p1" } },
    { account: "4750", debit: 0, credit: 190, dimensions: { partner_id: "p1" } },
  ],
};

const ledgers = [
  { id: LEDGER_LOCAL, code: "local", kind: "operational", currency: "COP", is_base: true, entity_id: null, status: "active" },
  { id: LEDGER_GROUP, code: "group", kind: "group", currency: "USD", is_base: false, entity_id: null, status: "active" },
];

const rules = [
  { id: "r1", code: "local-invoice", source_type: "invoice", ledger_id: LEDGER_LOCAL, account_map: {}, dimension_map: {}, rounding_account: "rounding_difference", priority: 100, active: true },
  { id: "r2", code: "group-invoice", source_type: "invoice", ledger_id: LEDGER_GROUP, account_map: { "1305": "cobros_grupo", "4135": "ventas_grupo", "4750": "iva_grupo" }, dimension_map: { report: "group" }, rounding_account: "rounding_difference", priority: 100, active: true },
];

const rates = [{
  from_currency: "COP", to_currency: "USD", rate_type: "closing",
  rate_date: "2026-11-01", rate: 0.00025,
}];

test("derivePostingPlan deriva ambos libros sin escribir", async () => {
  const calls = [];
  const service = createAccountingService({
    runner: fakeRunner(baseResponder({ source, ledgers, rules, rates }), calls),
    role: "owner",
    actorId: "u1",
  });

  const result = await derivePostingPlan({
    service,
    tenantId: TENANT,
    sourceId: SOURCE_ID,
    rateType: "closing",
  });

  assert.equal(result.plan.entries.length, 2);
  assert.equal(result.plan.entries[0].currency, "COP");
  assert.equal(result.plan.entries[1].currency, "USD");
  assert.equal(result.plan.entries[1].lines[0].account, "cobros_grupo");
  assert.equal(result.plan.entries[1].total_debit, result.plan.entries[1].total_credit);
  assert.ok(calls.every((call) => call.tenantId === TENANT && call.role === "owner" && call.actorId === "u1"));
});

test("persistPlan usa conflict idempotente y nunca mezcla tenants", async () => {
  const calls = [];
  const service = createAccountingService({
    runner: fakeRunner(baseResponder({ source, ledgers, rules, rates }), calls),
  });
  const { plan } = await derivePostingPlan({ service, tenantId: TENANT, sourceId: SOURCE_ID });
  const inserted = await service.persistPlan(TENANT, plan);

  assert.equal(inserted.length, 2);
  const inserts = calls.flatMap((call) => (Array.isArray(call.built) ? call.built : [call.built]))
    .filter((query) => query.text.includes("insert into public.erp_derived_entries"));
  assert.equal(inserts.length, 2);
  assert.ok(inserts.every((query) => query.text.includes("on conflict (tenant_id, source_type, source_id, ledger_id) do nothing")));
  assert.ok(inserts.every((query) => query.values[0] === TENANT));
});

test("derivePostingPlan rechaza libros no configurados y fuentes inexistentes", async () => {
  const service = createAccountingService({ runner: fakeRunner(baseResponder({ ledgers, rules, rates }), []) });
  await assert.rejects(
    () => derivePostingPlan({ service, tenantId: TENANT, sourceId: SOURCE_ID }),
    /no encontrado/,
  );

  const withSource = createAccountingService({
    runner: fakeRunner(baseResponder({ source, ledgers, rules, rates }), []),
  });
  await assert.rejects(
    () => derivePostingPlan({ service: withSource, tenantId: TENANT, sourceId: SOURCE_ID, ledgerCodes: ["fantasma"] }),
    /Libros no configurados/,
  );
});

test("buildConsolidationReport agrega miembros vigentes y cuadra", async () => {
  const group = { id: GROUP_ID, code: "HOLDING", name: "Holding", reporting_currency: "COP", method: "full", status: "active" };
  const members = [
    { entity_id: "e1", ownership: 1, effective_from: "2026-01-01", effective_to: null, method: "full" },
    { entity_id: "e2", ownership: 0.8, effective_from: "2026-01-01", effective_to: null, method: "full" },
  ];
  const entries = [1, 2].map((n) => ({
    entity_id: `e${n}`,
    entry_date: DATE,
    currency: "COP",
    rate: 1,
    rate_type: "closing",
    lines: [{ account: "ventas", debit: 100 * n, credit: 100 * n, dimensions: { entity: `e${n}` } }],
  }));
  const service = createAccountingService({
    runner: fakeRunner(baseResponder({ group, members, entries }), []),
  });

  const result = await buildConsolidationReport({
    service, tenantId: TENANT, groupCode: "holding", date: DATE,
  });
  assert.equal(result.group.code, "HOLDING");
  assert.equal(result.report.total_debit, 300);
  assert.equal(result.report.total_credit, 300);
  assert.deepEqual(result.report.entities.sort(), ["e1", "e2"]);
});

test("accountingError convierte falta de tabla en 503 sin filtrar detalles", () => {
  const error = accountingError({ code: "42P01", message: 'relation "public.erp_ledgers" does not exist' });
  assert.equal(error.status, 503);
  assert.match(error.publicMessage, /migración Ultra ERP no está aplicada/);
  assert.doesNotMatch(error.publicMessage, /connection|password|postgres:\/\//i);
});
