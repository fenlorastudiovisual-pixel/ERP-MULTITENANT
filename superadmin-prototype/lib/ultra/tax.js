// Motor fiscal por jurisdicción. Samjuro vende con IVA incluido: el modo
// inclusivo descompone el bruto en unidades menores para que neto + tax = bruto.

import { splitIncludedTax, toMinor, fromMinor } from "./money.js";

export const TAX_MODES = Object.freeze(["inclusive", "exclusive"]);

export function defineTaxRule({
  tenant_id,
  code,
  jurisdiction,
  tax_code,
  rate,
  valid_from,
  valid_to = null,
  priority = 100,
  inclusive_default = true,
  description = "",
} = {}) {
  if (!tenant_id || !code || !jurisdiction || !tax_code || !valid_from) {
    throw new Error("defineTaxRule: tenant_id, code, jurisdiction, tax_code y valid_from requeridos");
  }
  const value = Number(rate);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Tasa inválida: ${rate}`);
  return Object.freeze({
    tenant_id,
    code: String(code).trim().toUpperCase(),
    jurisdiction: String(jurisdiction).trim().toUpperCase(),
    tax_code: String(tax_code).trim().toUpperCase(),
    rate: value,
    valid_from: String(valid_from).slice(0, 10),
    valid_to: valid_to ? String(valid_to).slice(0, 10) : null,
    priority,
    inclusive_default,
    description,
    enabled: true,
  });
}

export function resolveTaxRule(rules = [], { jurisdiction, date, tax_code = null } = {}) {
  const jur = String(jurisdiction || "").trim().toUpperCase();
  const day = String(date || "").slice(0, 10);
  if (!jur || !day) throw new Error("resolveTaxRule: jurisdiction y date requeridos");

  const found = rules
    .filter((rule) =>
      rule.enabled !== false
      && rule.jurisdiction === jur
      && String(rule.valid_from).slice(0, 10) <= day
      && (!rule.valid_to || String(rule.valid_to).slice(0, 10) >= day)
      && (!tax_code || rule.tax_code === String(tax_code).trim().toUpperCase()),
    )
    .sort((a, b) =>
      Number(b.priority || 0) - Number(a.priority || 0)
      || String(b.valid_from).localeCompare(String(a.valid_from)),
    )[0];

  if (!found) throw new Error(`Sin regla fiscal para ${jur} en ${day}`);
  return found;
}

export function calculateTax({ amount, rule, currency = "COP", mode = null } = {}) {
  if (!rule) throw new Error("calculateTax: regla requerida");
  const chosen = TAX_MODES.includes(mode) ? mode : (rule.inclusive_default ? "inclusive" : "exclusive");
  const code = String(currency || "COP").toUpperCase();

  if (chosen === "inclusive") {
    const split = splitIncludedTax(amount, rule.rate, code);
    return {
      mode: chosen,
      currency: code,
      tax_code: rule.tax_code,
      rate: rule.rate,
      gross: split.gross,
      net: split.net,
      tax: split.tax,
      grossMinor: split.grossMinor,
      netMinor: split.netMinor,
      taxMinor: split.taxMinor,
    };
  }

  const netMinor = toMinor(amount, code);
  const taxMinor = Math.round(netMinor * Number(rule.rate));
  return {
    mode: chosen,
    currency: code,
    tax_code: rule.tax_code,
    rate: Number(rule.rate),
    gross: fromMinor(netMinor + taxMinor, code),
    net: fromMinor(netMinor, code),
    tax: fromMinor(taxMinor, code),
    grossMinor: netMinor + taxMinor,
    netMinor,
    taxMinor,
  };
}

/** Calcula impuestos línea por línea y verifica que los totales cuadren. */
export function buildInvoiceTaxLines({ lines = [], rule, currency = "COP", mode = null } = {}) {
  if (!Array.isArray(lines) || !lines.length) throw new Error("buildInvoiceTaxLines: líneas requeridas");

  const code = String(currency || "COP").toUpperCase();
  const computed = lines.map((line, index) => ({
    line: index + 1,
    sku: line.sku || null,
    ...calculateTax({ amount: line.amount ?? line.total ?? 0, rule, currency: code, mode }),
  }));

  const totalGrossMinor = computed.reduce((sum, item) => sum + item.grossMinor, 0);
  const totalNetMinor = computed.reduce((sum, item) => sum + item.netMinor, 0);
  const totalTaxMinor = computed.reduce((sum, item) => sum + item.taxMinor, 0);
  if (totalNetMinor + totalTaxMinor !== totalGrossMinor) {
    throw new Error("Líneas de impuesto desbalanceadas");
  }

  return {
    currency: code,
    tax_code: rule.tax_code,
    lines: computed,
    totals: {
      gross: fromMinor(totalGrossMinor, code),
      net: fromMinor(totalNetMinor, code),
      tax: fromMinor(totalTaxMinor, code),
      grossMinor: totalGrossMinor,
      netMinor: totalNetMinor,
      taxMinor: totalTaxMinor,
    },
  };
}

/** Validación previa a enviar a un gateway CFDI/UBL/Facturae. Sin credenciales. */
export function validateEinvoicePayload(payload = {}) {
  const required = ["tenant_id", "jurisdiction", "document_type", "issuer_entity_id", "document_number", "issue_date", "total"];
  const missing = required.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === "");
  if (missing.length) {
    const error = new Error(`Factura electrónica incompleta: ${missing.join(", ")}`);
    error.status = 422;
    error.fields = missing;
    throw error;
  }
  if (!(Number(payload.total) >= 0)) throw new Error("Total de factura electrónica inválido");
  return payload;
}

