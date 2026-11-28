// Dinero en unidades menores. Samjuro maneja precios con IVA incluido,
// así que la descomposición garantiza que neto + impuesto == bruto exacto.

const MINOR_UNITS = Object.freeze({
  COP: 0,
  CLP: 0,
  USD: 2,
  EUR: 2,
  MXN: 2,
  ARS: 2,
});

export function scaleFor(currency = "COP") {
  const code = String(currency || "COP").toUpperCase();
  return MINOR_UNITS[code] ?? 2;
}

export function toMinor(amount, currency = "COP") {
  const factor = 10 ** scaleFor(currency);
  return Math.round(Number(amount) * factor);
}

export function fromMinor(minor, currency = "COP") {
  const factor = 10 ** scaleFor(currency);
  return Number(minor) / factor;
}

/**
 * Parte un precio con impuesto incluido.
 * El redondeo se hace en unidades menores para que la suma cuadre siempre.
 */
export function splitIncludedTax(gross, rate = 0.19, currency = "COP") {
  const grossMinor = toMinor(gross, currency);
  const taxRate = Number(rate);
  if (!Number.isFinite(taxRate) || taxRate < 0) throw new Error("Tasa de impuesto inválida");

  const netMinor = Math.round(grossMinor / (1 + taxRate));
  const taxMinor = grossMinor - netMinor;

  return {
    currency,
    rate: taxRate,
    gross: fromMinor(grossMinor, currency),
    net: fromMinor(netMinor, currency),
    tax: fromMinor(taxMinor, currency),
    grossMinor,
    netMinor,
    taxMinor,
  };
}

/**
 * Líneas de asiento: { account, debit, credit } en unidades monetarias.
 * Lanza si débito y crédito no cuadran en unidades menores.
 */
export function assertBalanced(lines = [], currency = "COP") {
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    debit += toMinor(line.debit ?? 0, currency);
    credit += toMinor(line.credit ?? 0, currency);
  }
  if (debit !== credit) {
    const error = new Error(`Asiento desbalanceado: débito ${debit} ≠ crédito ${credit}`);
    error.status = 422;
    error.debit = debit;
    error.credit = credit;
    throw error;
  }
  return { debit, credit, balanced: true };
}

export function applyDiscount(amount, discount, currency = "COP") {
  const factor = 10 ** scaleFor(currency);
  const base = Math.round(Number(amount) * factor);
  const off = Math.round(base * (Number(discount) || 0));
  return fromMinor(base - off, currency);
}
