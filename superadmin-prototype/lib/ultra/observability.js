// Observabilidad SIN secretos: cada evento de negocio lleva trace_id, span_id,
// tenant y entity; los contextos se redactan antes de salir del servidor.

const SECRET_KEYS = new Set([
  "password",
  "password_hash",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "api_key",
  "connection_string",
  "database_url",
  "private_key",
]);

const fallback = (() => {
  let counter = 0;
  return () => `00000000-0000-4000-8000-${(Date.now() + counter++).toString(16).padStart(12, "0").slice(-12)}`;
})();

export function createTraceId() {
  return globalThis.crypto?.randomUUID?.() || fallback();
}

export function createSpanId() {
  return globalThis.crypto?.randomUUID?.() || fallback();
}

export function redact(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SECRET_KEYS.has(String(key).toLowerCase()) ? "[redacted]" : redact(item, seen);
  }
  return output;
}

export function startSpan({
  traceId = createTraceId(),
  name,
  tenantId = "",
  entityId = null,
  jobId = null,
  now = () => new Date(),
} = {}) {
  if (!name) throw new Error("startSpan: name requerido");
  return {
    trace_id: traceId,
    span_id: createSpanId(),
    name,
    tenant_id: tenantId,
    entity_id: entityId ? String(entityId) : null,
    job_id: jobId ? String(jobId) : null,
    started_at: new Date(now()).toISOString(),
  };
}

export function finishSpan(span, { status = "ok", error = null, now = () => new Date() } = {}) {
  if (!span?.started_at) throw new Error("finishSpan: span inválido");
  const endedAt = new Date(now()).toISOString();
  return {
    ...span,
    status,
    error: error ? String(error).slice(0, 500) : null,
    ended_at: endedAt,
    duration_ms: Math.max(0, new Date(endedAt).getTime() - new Date(span.started_at).getTime()),
  };
}

export function logEnvelope({
  level = "info",
  message,
  traceId,
  spanId,
  tenantId = "",
  context = {},
  now = () => new Date(),
} = {}) {
  if (!message) throw new Error("logEnvelope: message requerido");
  return redact({
    level,
    message,
    trace_id: traceId || null,
    span_id: spanId || null,
    tenant_id: tenantId || null,
    context,
    at: new Date(now()).toISOString(),
  });
}

/** Evalúa SLOs con una ventana de muestras. `samples` = [{ ok: boolean }]. */
export function evaluateSlo({ name, samples = [], objective = 0.99, window = "1h" } = {}) {
  if (!name) throw new Error("evaluateSlo: name requerido");
  const target = Number(objective);
  if (!Number.isFinite(target) || target < 0 || target > 1) throw new Error("Objetivo SLO inválido");
  const total = samples.length;
  const okCount = samples.filter((sample) => sample?.ok === true).length;
  const observed = total ? okCount / total : 1;
  return {
    name,
    window,
    objective: target,
    observed,
    ok: observed >= target,
    total,
    breaches: total - okCount,
  };
}
