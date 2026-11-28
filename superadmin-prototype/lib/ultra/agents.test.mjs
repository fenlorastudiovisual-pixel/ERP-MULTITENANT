import test from "node:test";
import assert from "node:assert/strict";
import { assertToolAllowed, createAgentGateway, defineAgent } from "./agents.js";

const TENANT = "77777777-7777-7777-7777-777777777777";

function createStore() {
  const state = { runs: new Map(), traces: [], gates: [], events: [] };
  return {
    state,
    putRun: async (tenantId, run) => { state.runs.set(`${tenantId}:${run.id}`, run); },
    getRun: async (tenantId, runId) => state.runs.get(`${tenantId}:${runId}`) || null,
    appendTrace: async (tenantId, trace) => { state.traces.push({ ...trace, tenant_id: tenantId }); },
    appendGate: async (tenantId, gate) => { state.gates.push({ ...gate, tenant_id: tenantId }); },
    emit: async (tenantId, event) => { state.events.push({ ...event, tenant_id: tenantId }); },
  };
}

function agent(overrides = {}) {
  return defineAgent({
    tenant_id: TENANT,
    key: "post_journal",
    tools: [{ name: "post_journal", scopes: ["finance"] }],
    approval_required: true,
    ...overrides,
  });
}

test("defineAgent rechaza autonomía divergente de aprobación", () => {
  assert.throws(
    () => agent({ autonomy: "execute", approval_required: true }),
    /approval_required=false/,
  );
});

test("assertToolAllowed bloquea herramientas fuera de la allowlist", () => {
  const definition = agent();
  assert.equal(assertToolAllowed(definition, "post_journal", { scope: "finance" }).name, "post_journal");
  assert.throws(() => assertToolAllowed(definition, "delete_all"), /no permitida/);
  assert.throws(() => assertToolAllowed(definition, "post_journal", { scope: "hr" }), /Scope no permitido/);
});

test("el agente propone, espera aprobación y luego ejecuta con traza", async () => {
  const store = createStore();
  const gateway = createAgentGateway({
    store,
    handlers: { post_journal: async ({ input }) => ({ posted: true, amount: input.amount }) },
  });

  const proposed = await gateway.propose({
    tenantId: TENANT,
    agent: agent(),
    entityType: "invoice",
    entityId: "FV-1",
    proposed: { tool: "post_journal", input: { amount: 1190 } },
  });
  assert.equal(proposed.status, "proposed");

  await assert.rejects(
    () => gateway.execute({ tenantId: TENANT, runId: proposed.id }),
    /Aprobación requerida/,
  );

  const approved = await gateway.decide({
    tenantId: TENANT,
    runId: proposed.id,
    decision: "approved",
    approver: "owner@test",
    note: "revisado",
  });
  assert.equal(approved.status, "approved");
  assert.equal(store.state.gates.length, 1);

  const executed = await gateway.execute({ tenantId: TENANT, runId: proposed.id });
  assert.equal(executed.run.status, "executed");
  assert.deepEqual(executed.run.result, { posted: true, amount: 1190 });
  assert.equal(executed.trace.tool, "post_journal");
  assert.equal(store.state.events[0].event_type, "agent.executed");
});

test("un agente sin aprobación puede ejecutar directamente pero sigue trazado", async () => {
  const store = createStore();
  const gateway = createAgentGateway({
    store,
    handlers: { post_journal: async () => ({ posted: true }) },
  });
  const run = await gateway.propose({
    tenantId: TENANT,
    agent: agent({ approval_required: false, autonomy: "execute" }),
    entityType: "invoice",
    entityId: "FV-2",
    proposed: { tool: "post_journal", input: {} },
  });
  assert.equal(run.status, "approved");
  const executed = await gateway.execute({ tenantId: TENANT, runId: run.id });
  assert.equal(executed.run.status, "executed");
  assert.equal(store.state.traces.length, 1);
});
