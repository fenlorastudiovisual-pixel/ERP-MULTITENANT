import test from "node:test";
import assert from "node:assert/strict";
import { applyDiscount, assertBalanced, splitIncludedTax, toMinor } from "./money.js";

test("descompone IVA incluido en COP sin perder centavos", () => {
  const result = splitIncludedTax(1190, 0.19, "COP");
  assert.equal(result.net, 1000);
  assert.equal(result.tax, 190);
  assert.equal(result.netMinor + result.taxMinor, result.grossMinor);
});

test("un total real de Samjuro cuadra exactamente", () => {
  const result = splitIncludedTax(1744108, 0.19, "COP");
  assert.equal(result.netMinor + result.taxMinor, 1744108);
  assert.equal(result.net + result.tax, 1744108);
});

test("unidades menores respetan la moneda", () => {
  assert.equal(toMinor(10.5, "USD"), 1050);
  assert.equal(toMinor(10.5, "COP"), 11);
  assert.equal(applyDiscount(1000, 0.1, "COP"), 900);
});

test("un asiento desbalanceado se rechaza", () => {
  assert.deepEqual(
    assertBalanced([
      { debit: 100, credit: 0 },
      { debit: 0, credit: 100 },
    ], "COP"),
    { debit: 100, credit: 100, balanced: true },
  );
  assert.throws(
    () => assertBalanced([{ debit: 100, credit: 90 }], "COP"),
    /Asiento desbalanceado/,
  );
});
