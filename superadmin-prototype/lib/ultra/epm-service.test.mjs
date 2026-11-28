import test from "node:test";
import assert from "node:assert/strict";
import { createEpmService } from "./epm-service.js";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENTITY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
      if (text.includes("from public.erp_entities")) return overrides.entities ?? [{ id: ENTITY }];
      if (text.includes("insert into public.erp_budgets")) return [{ id: "budget-1" }];
      if (text.includes("insert into public.erp_budget_lines")) return [];
      if (text.includes("insert into public.erp_cash_positions")) return [{ id: "cash-1" }];
      if (text.includes("insert into public.erp_forecasts")) return [];
      if (text.includes("cross join lateral jsonb_array_elements")) return overrides.actuals ?? [];
      if (text.includes("from public.erp_budgets")) return overrides.budgets ?? [];
      if (text.includes("from public.erp_budget_lines")) return overrides.lines ?? [];
      if (text.includes("from public.erp_cash_positions")) return overrides.positions ?? [];
      if (text.includes("from public.erp_forecasts")) return overrides.forecasts ?? [];
      return [];
    };
    return Array.isArray(built) ? built.map(respond) : respond(built);
  };
}

test("saveBudget usa el id real de la cabecera antes de insertar las líneas", async () => {
  const calls = [];
  const service = createEpmService({
    runner: fakeRunner(baseResponder(), calls), role: "owner", actorId: "u1",
  });
  const saved = await service.saveBudget(TENANT, {
    code: "PT-2026-11", name: "Noviembre", period: "2026-11",
    lines: [{ account: "4135", amount: 1000, dimensions: { cost_center: "VENTAS" } }],
  });
  assert.equal(saved.id, "budget-1");
  assert.equal(saved.lines.length, 1);
  assert.equal(saved.lines[0].amount, 1000);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].built.text.includes("on conflict (tenant_id, code, period)"));
  assert.ok(calls[1].built[0].text.includes("insert into public.erp_budget_lines"));
  assert.ok(calls[1].built[0].values.includes("budget-1"));
  assert.ok(calls.every((call) => call.tenantId === TENANT && call.role === "owner" && call.actorId === "u1"));
});

test("compareBudgetFor consulta solo el libro group y el periodo del presupuesto", async () => {
  const calls = [];
  const service = createEpmService({ runner: fakeRunner(baseResponder({
    actuals: [{ account: "4135", debit: 0, credit: 1190, dimensions: {} }],
  }), calls) });
  const budget = {
    currency: "COP", period: "2026-11", dimensions: {},
    lines: [{ account: "4135", amount: 1000, dimensions: {} }],
  };
  const report = await service.compareBudgetFor(TENANT, budget);
  assert.equal(report.totals.variance, 190);
  const sql = calls[0].built.text;
  assert.match(sql, /ledger\.kind = 'group'/);
  assert.match(sql, /d\.entry_date >=/);
  assert.match(sql, /d\.entry_date </);
});

test("saveCashPosition resuelve la entidad única y cuadra apertura, entradas y salidas", async () => {
  const calls = [];
  const service = createEpmService({ runner: fakeRunner(baseResponder(), calls) });
  const saved = await service.saveCashPosition(TENANT, {
    date: "2026-11-30", currency: "COP", opening: 500,
    movements: [
      { direction: "in", amount: 1190, category: "cobros" },
      { direction: "out", amount: 190, category: "impuestos" },
    ],
  });
  assert.equal(saved.entity_id, ENTITY);
  assert.equal(saved.closing, 1500);
  const insert = calls.at(-1).built;
  assert.ok(insert.values.includes(1500));
  await assert.rejects(
    () => service.saveCashPosition(TENANT, { date: "30-11-2026" }),
    /YYYY-MM-DD/,
  );
});

test("saveForecast escribe una fila por periodo y respeta el método elegido", async () => {
  const calls = [];
  const service = createEpmService({ runner: fakeRunner(baseResponder(), calls) });
  const saved = await service.saveForecast(TENANT, {
    currency: "COP", periods: 2, method: "budget", budget: { amount: 500 },
    actuals: [{ period: "2026-11", amount: 300 }],
  });
  assert.equal(saved.method, "budget");
  assert.equal(saved.periods.length, 2);
  const writes = calls.at(-1).built;
  assert.equal(writes.length, 2);
  assert.ok(writes.every((query) => query.values.includes("budget")));
  assert.deepEqual(saved.periods.map((item) => item.period), ["2026-12", "2027-01"]);
});

test("listBudgets hidrata las líneas desde unidades menores", async () => {
  const service = createEpmService({ runner: fakeRunner(baseResponder({
    budgets: [{ id: "budget-1", code: "PT-2026-11", currency: "USD", period: "2026-11" }],
    lines: [{ budget_id: "budget-1", line_no: 1, account: "4135", dimensions: {}, amount_minor: 10050 }],
  }), []) });
  const [budget] = await service.listBudgets(TENANT);
  assert.equal(budget.lines[0].amount, 100.5);
});
