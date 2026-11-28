import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCashPosition,
  buildForecast,
  compareBudget,
  defineBudget,
  dimensionReport,
} from "./epm.js";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("defineBudget normaliza líneas y valida el periodo", () => {
  const budget = defineBudget({
    tenant_id: TENANT,
    code: "PT-2026-11",
    name: "Presupuesto noviembre",
    period: "2026-11",
    currency: "COP",
    lines: [
      { account: "4135", amount: 1000, dimensions: { cost_center: "VENTAS" } },
      { account: "4750", amount: 190, dimensions: { cost_center: "VENTAS", partner_id: "p1" } },
    ],
  });
  assert.equal(budget.lines.length, 2);
  assert.deepEqual(budget.lines[1].dimensions, { cost_center: "VENTAS", partner_id: "p1" });
  assert.throws(() => defineBudget({ tenant_id: TENANT, code: "x", name: "x", period: "26-11", lines: [{}] }), /YYYY-MM/);
});

test("compareBudget calcula desviaciones en unidades menores y filtra dimensiones", () => {
  const budget = defineBudget({
    tenant_id: TENANT,
    code: "PT-2026-11",
    name: "Presupuesto",
    period: "2026-11",
    currency: "COP",
    lines: [
      { account: "4135", amount: 1000, dimensions: { cost_center: "VENTAS" } },
      { account: "4750", amount: 190, dimensions: { cost_center: "IMPUESTOS" } },
    ],
  });
  const actuals = [
    { account: "4135", credit: 1190, debit: 0, dimensions: { cost_center: "VENTAS" } },
    { account: "4750", credit: 190, debit: 0, dimensions: { cost_center: "IMPUESTOS" } },
  ];
  const report = compareBudget({ budget, actuals, dimensions: { cost_center: "VENTAS" } });
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].variance, 190);
  assert.equal(report.rows[0].variancePct, 19);
  assert.equal(report.totals.actual, 1190);

  const all = compareBudget({ budget, actuals });
  assert.equal(all.rows.length, 2);
  assert.equal(all.rows.find((row) => row.account === "4750").variance, 0);
  // La desviación real es +190 (4135: 1190 vs 1000); 4750 cuadra exacto.
  assert.equal(all.totals.variance, 190);
});

test("compareBudget conserva la escala en USD y rechaza FX sin tasas", () => {
  const budget = defineBudget({
    tenant_id: TENANT,
    code: "PT-USD",
    name: "Presupuesto USD",
    period: "2026-12",
    currency: "USD",
    lines: [{ account: "4135", amount: 100.5, dimensions: {} }],
  });
  assert.equal(budget.lines[0].amount, 100.5);
  const report = compareBudget({
    budget,
    actuals: [{ account: "4135", credit: 100.5, debit: 0, dimensions: {} }],
  });
  assert.equal(report.totals.budget, 100.5);
  assert.equal(report.totals.actual, 100.5);
  assert.equal(report.totals.variance, 0);
  assert.throws(() => compareBudget({ budget, actuals: [], currency: "COP" }), /convierte antes/);
});

test("dimensionReport agrupa por dimensión y conserva el neto", () => {
  const entries = [{
    lines: [
      { account: "4135", credit: 1190, debit: 0, dimensions: { entity: "e1", cost_center: "VENTAS" } },
      { account: "1305", credit: 0, debit: 1190, dimensions: { entity: "e1", cost_center: "VENTAS" } },
      { account: "4135", credit: 100, debit: 0, dimensions: { entity: "e2", cost_center: "VENTAS" } },
    ],
  }];
  const report = dimensionReport({ entries, dimensions: ["entity"] });
  assert.equal(report.rows.length, 2);
  assert.equal(report.total_net, 1190 + 100 - 1190);
  assert.ok(report.rows.some((row) => row.dimensions.entity === "e2" && row.net === 100));
});

test("buildCashPosition cuadra apertura, entradas y salidas por categoría", () => {
  const position = buildCashPosition({
    opening: 500,
    currency: "COP",
    date: "2026-11-30",
    movements: [
      { direction: "in", amount: 1190, category: "cobros" },
      { direction: "out", amount: 190, category: "impuestos" },
    ],
  });
  assert.equal(position.closing, 1500);
  assert.equal(position.byCategory.find((row) => row.category === "cobros").net, 1190);
  assert.throws(() => buildCashPosition({ movements: [{ direction: "other", amount: 1 }] }), /inválida/);
});

test("buildForecast usa presupuesto o promedio reciente sin inventar estacionalidad", () => {
  const actuals = [
    { period: "2026-09", amount: 100 },
    { period: "2026-10", amount: 200 },
    { period: "2026-11", amount: 300 },
  ];
  const average = buildForecast({ actuals, periods: 2 });
  assert.deepEqual(average.periods.map((row) => row.period), ["2026-12", "2027-01"]);
  assert.equal(average.periods[0].amount, 200);
  assert.equal(average.method, "recent_average");

  const planned = buildForecast({ actuals, budget: { amount: 500 }, method: "budget", periods: 1 });
  assert.equal(planned.periods[0].amount, 500);
  assert.equal(planned.method, "budget");
});
