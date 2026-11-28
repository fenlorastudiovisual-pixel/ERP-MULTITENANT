import test from "node:test";
import assert from "node:assert/strict";
import { buildInvoiceTaxLines, calculateTax, defineTaxRule, resolveTaxRule, validateEinvoicePayload } from "./tax.js";

const TENANT = "66666666-6666-6666-6666-666666666666";
const rule = defineTaxRule({
  tenant_id: TENANT,
  code: "CO-IVA-19",
  jurisdiction: "CO",
  tax_code: "IVA19",
  rate: 0.19,
  valid_from: "2026-01-01",
});

test("resolveTaxRule elige regla vigente por jurisdicción y fecha", () => {
  assert.equal(resolveTaxRule([rule], { jurisdiction: "CO", date: "2026-11-27" }).code, "CO-IVA-19");
  assert.throws(() => resolveTaxRule([rule], { jurisdiction: "MX", date: "2026-11-27" }), /Sin regla fiscal/);
});

test("IVA incluido de Samjuro descompone 1190 en 1000 + 190", () => {
  const result = calculateTax({ amount: 1190, rule, currency: "COP" });
  assert.equal(result.mode, "inclusive");
  assert.equal(result.net, 1000);
  assert.equal(result.tax, 190);
  assert.equal(result.netMinor + result.taxMinor, result.grossMinor);
});

test("modo exclusivo calcula el impuesto sobre la base", () => {
  const result = calculateTax({ amount: 1000, rule, currency: "COP", mode: "exclusive" });
  assert.equal(result.net, 1000);
  assert.equal(result.tax, 190);
  assert.equal(result.gross, 1190);
});

test("buildInvoiceTaxLines cuadra totales con SKUs reales de Samjuro", () => {
  const result = buildInvoiceTaxLines({
    lines: [
      { sku: "CH-ESM-208", amount: 1190 },
      { sku: "SAM-233-35", amount: 2380 },
    ],
    rule,
    currency: "COP",
  });
  assert.equal(result.totals.gross, 3570);
  assert.equal(result.totals.net, 3000);
  assert.equal(result.totals.tax, 570);
  assert.equal(result.totals.netMinor + result.totals.taxMinor, result.totals.grossMinor);
});

test("validateEinvoicePayload exige emisor y número", () => {
  assert.throws(
    () => validateEinvoicePayload({ tenant_id: TENANT, jurisdiction: "CO", document_type: "FV", document_number: "FV-1", issue_date: "2026-11-27", total: 1190 }),
    /issuer_entity_id/,
  );
  const payload = validateEinvoicePayload({
    tenant_id: TENANT,
    jurisdiction: "CO",
    document_type: "FV",
    issuer_entity_id: "E-1",
    document_number: "FV-1",
    issue_date: "2026-11-27",
    total: 1190,
  });
  assert.equal(payload.total, 1190);
});
