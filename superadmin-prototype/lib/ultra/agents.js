// Gobernanza de agentes: identidad, herramientas permitidas, gate humano y traza.
// El agente propone; el ledger solo se escribe después de aprobar y ejecutar.

export const AUTONOMY_LEVELS = Object.freeze(["propose", "approve", "execute"]);

let counter = 0;
function defaultId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `00000000-0000-4000-8000-${(Date.now() + counter++).toString(16).padStart(12, "0").slice(-12)}`;
}

export function defineAgent({
  tenant_id,
  key,
  version = 1,
  name = key,
  role = "tenant_user",
  tools = [],
  approval_required = true,
  autonomy = "propose",
  config = {},
} = {}) {
  if (!tenant_id || !key) throw new Error("defineAgent: tenant_id y key requeridos");
  if (!AUTONOMY_LEVELS.includes(autonomy)) throw new Error(`Autonomía inválida: ${autonomy}`);
  if (approval_required && autonomy === "execute") {
    throw new Error("autonomy=execute requiere approval_required=false");
  }
  return Object.freeze({
    id: null,
    tenant_id,
    key: String(key).trim().toLowerCase(),
    version,
    name,
    role,
    tools: Object.freeze(tools.map((tool) => (typeof tool === "string" ? { name: tool, scopes: [] } : tool))),
    approval_required,
    autonomy,
    config,
    active: true,
  });
}

export function assertToolAllowed(agent, tool, { scope = null } = {}) {
  if (!agent) throw new Error("assertToolAllowed: agente requerido");
  const descriptor = agent.tools?.find((item) => item.name === tool);
  if (!descriptor) {
    const error = new Error(`Herramienta no permitida para el agente: ${tool}`);
    error.status = 403;
    throw error;
  }
  if (scope && Array.isArray(descriptor.scopes) && descriptor.scopes.length && !descriptor.scopes.includes(scope)) {
    const error = new Error(`Scope no permitido para ${tool}: ${scope}`);
    error.status = 403;
    throw error;
  }
  return descriptor;
}

export function createAgentRun({
  agent,
  tenantId,
  entityType,
  entityId,
  proposed = {},
  context = {},
  now = () => new Date(),
  id = defaultId,
} = {}) {
  if (!agent || !tenantId) throw new Error("createAgentRun: agent y tenantId requeridos");
  const at = new Date(now()).toISOString();
  return {
    id: id("run"),
    tenant_id: tenantId,
    agent_id: agent.id || null,
    agent_key: agent.key,
    agent_version: agent.version,
    agent_tools: (agent.tools || []).map((tool) => ({ ...tool })),
    entity_type: entityType || null,
    entity_id: entityId ? String(entityId) : null,
    status: agent.approval_required ? "proposed" : "approved",
    approval_required: Boolean(agent.approval_required),
    proposed,
    context,
    result: null,
    approval: null,
    created_at: at,
    updated_at: at,
  };
}

export function decideApproval({ run, decision, approver, note = "", now = () => new Date() } = {}) {
  if (!run || run.status !== "proposed") throw new Error("Solo se puede decidir una corrida propuesta");
  if (!["approved", "rejected"].includes(decision)) throw new Error(`Decisión inválida: ${decision}`);
  return {
    ...run,
    status: decision,
    approval: {
      decision,
      approver: approver || "",
      note,
      decided_at: new Date(now()).toISOString(),
    },
    updated_at: new Date(now()).toISOString(),
  };
}

export function buildAgentTrace({ run, step = 1, tool, input = {}, output = null, error = null, duration_ms = 0, now = () => new Date() } = {}) {
  if (!run?.id || !tool) throw new Error("buildAgentTrace: run y tool requeridos");
  return {
    id: defaultId(),
    tenant_id: run.tenant_id,
    run_id: run.id,
    step,
    tool,
    input,
    output,
    error: error ? String(error).slice(0, 500) : null,
    duration_ms,
    occurred_at: new Date(now()).toISOString(),
  };
}

/**
 * Store requerido:
 *   putRun(tenantId, run)
 *   getRun(tenantId, runId)
 *   appendTrace(tenantId, trace)
 *   appendGate?(tenantId, gate)
 *   emit?(tenantId, event)
 */
export function createAgentGateway({ store, handlers = {}, now = () => new Date(), id = defaultId } = {}) {
  if (!store?.putRun || !store?.getRun || !store?.appendTrace) throw new Error("AgentGateway requiere store válido");

  async function propose({ tenantId, agent, entityType, entityId, proposed, context }) {
    const run = createAgentRun({ agent, tenantId, entityType, entityId, proposed, context, now, id });
    assertToolAllowed(agent, proposed?.tool);
    await store.putRun(tenantId, run);
    return run;
  }

  async function decide({ tenantId, runId, decision, approver, note }) {
    const run = await store.getRun(tenantId, runId);
    if (!run) throw new Error(`Corrida no encontrada: ${runId}`);
    const decided = decideApproval({ run, decision, approver, note, now });
    await store.putRun(tenantId, decided);
    if (store.appendGate) {
      await store.appendGate(tenantId, {
        id: id("gate"),
        tenant_id: tenantId,
        run_id: runId,
        gate_type: "human_approval",
        required_role: "admin",
        status: decision,
        decided_by: approver || null,
        decided_at: new Date(now()).toISOString(),
        note: note || "",
      });
    }
    return decided;
  }

  async function execute({ tenantId, runId }) {
    const run = await store.getRun(tenantId, runId);
    if (!run) throw new Error(`Corrida no encontrada: ${runId}`);
    if (run.status === "proposed") {
      const error = new Error("Aprobación requerida antes de ejecutar");
      error.status = 409;
      throw error;
    }
    if (run.status !== "approved") throw new Error(`Corrida en estado ${run.status}; no ejecutable`);

    const tool = run.proposed?.tool;
    assertToolAllowed({ tools: run.agent_tools || [] }, tool);
    const handler = handlers[tool];
    if (!handler) throw new Error(`Handler no registrado: ${tool}`);

    const startedAt = Date.now();
    let output = null;
    let error = null;
    try {
      output = await handler({ tenantId, run, input: run.proposed.input || {} });
    } catch (caught) {
      error = caught?.message || String(caught);
      run.status = "failed";
    }

    const trace = buildAgentTrace({
      run,
      tool,
      input: run.proposed.input || {},
      output,
      error,
      duration_ms: Date.now() - startedAt,
      now,
    });

    await store.appendTrace(tenantId, trace);
    if (!error) {
      run.status = "executed";
      run.result = output ?? null;
    }
    run.updated_at = new Date(now()).toISOString();
    await store.putRun(tenantId, run);

    if (store.emit && !error) {
      await store.emit(tenantId, {
        event_type: "agent.executed",
        dedupe_key: `${run.id}:executed`,
        payload: { runId: run.id, tool },
      });
    }

    return { run, trace, error };
  }

  return { propose, decide, execute };
}
