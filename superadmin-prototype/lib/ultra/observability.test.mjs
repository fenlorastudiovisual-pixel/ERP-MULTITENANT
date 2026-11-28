import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSlo, finishSpan, logEnvelope, redact, startSpan } from "./observability.js";

test("redact elimina secretos anidados sin perder datos seguros", () => {
  const result = redact({
    password: "no-imprimir",
    nested: { api_key: "no-imprimir", connection_string: "no-imprimir", sku: "CH-ESM-208" },
  });
  assert.equal(result.password, "[redacted]");
  assert.equal(result.nested.api_key, "[redacted]");
  assert.equal(result.nested.connection_string, "[redacted]");
  assert.equal(result.nested.sku, "CH-ESM-208");
});

test("startSpan/finishSpan calculan duración con reloj inyectado", () => {
  const t0 = new Date("2026-11-27T10:00:00.000Z");
  const t1 = new Date("2026-11-27T10:00:00.005Z");
  const span = startSpan({ name: "post.journal", tenantId: "t1", now: () => t0 });
  const finished = finishSpan(span, { status: "ok", now: () => t1 });
  assert.equal(finished.duration_ms, 5);
  assert.equal(finished.tenant_id, "t1");
  assert.match(finished.trace_id, /^[0-9a-f-]{36}$/i);
});

test("logEnvelope no filtra secretos del contexto", () => {
  const envelope = logEnvelope({
    message: "cierre ejecutado",
    tenantId: "t1",
    context: { token: "no-imprimir", invoice: "FV-1" },
    now: () => new Date("2026-11-27T10:00:00.000Z"),
  });
  assert.equal(envelope.context.token, "[redacted]");
  assert.equal(envelope.context.invoice, "FV-1");
});

test("evaluateSlo detecta incumplimiento y cuantifica brechas", () => {
  const samples = [...Array(98).fill({ ok: true }), ...Array(2).fill({ ok: false })];
  const result = evaluateSlo({ name: "posting.success", samples, objective: 0.99, window: "1h" });
  assert.equal(result.observed, 0.98);
  assert.equal(result.ok, false);
  assert.equal(result.breaches, 2);
});
