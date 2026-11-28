import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_ACTIONS,
  ALLOWED_ENTITY_TYPES,
  ALLOWED_WORKFLOW_KEYS,
  CLOSE_WORKFLOW,
  createUltraWorkflowEngine,
  workflowEvents,
} from "./workflow-definitions.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ENTITY = "22222222-2222-4222-8222-222222222222";

function createStore() {
  const state = { runs: new Map(), idem: new Map(), effects: new Map(), outbox: new Map() };
  const clone = (value) => (value ? JSON.parse(JSON.stringify(value)) : null);

  const ops = {
    getIdempotency: async (tenantId, key) => state.idem.get(`${tenantId}:${key}`) || null,
    putIdempotency: async (tenantId, key, result) => { state.idem.set(`${tenantId}:${key}`, { result }); },
    getInstance: async (tenantId, id) => clone(state.runs.get(`${tenantId}:${id}`)) || null,
    putInstance: async (tenantId, instance) => { state.runs.set(`${tenantId}:${instance.id}`, clone(instance)); },
    listDue: async () => [],
    hasEffect: async (tenantId, effectId) => state.effects.get(`${tenantId}:${effectId}`)?.status === "done",
    markEffect: async (tenantId, record) => {
      state.effects.set(`${tenantId}:${record.effectId}`, { ...record });
    },
    emitOutbox: async (tenantId, event) => {
      const key = `${tenantId}:${event.dedupe_key}`;
      if (!state.outbox.has(key)) state.outbox.set(key, { ...event, tenant_id: tenantId });
      return state.outbox.get(key);
    },
  };

  return {
    state,
    ...ops,
    transaction: async (fn) => fn(ops),
  };
}

test("el registro solo expone definiciones, acciones y eventos allowlisted", () => {
  assert.deepEqual(ALLOWED_WORKFLOW_KEYS, ["ultra.close"]);
  assert.ok(ALLOWED_ACTIONS.includes("advance"));
  assert.ok(ALLOWED_ENTITY_TYPES.includes("closing"));
  assert.deepEqual(workflowEvents(), ["submit", "approve", "reject"]);
});

test("start es idempotente, las guardas bloquean roles y el cierre completa", async () => {
  const store = createStore();
  const engine = createUltraWorkflowEngine({ store });
  const base = {
    tenantId: TENANT,
    definition: CLOSE_WORKFLOW,
    entityType: "closing",
    entityId: ENTITY,
    context: { date: "2026-11-30" },
  };

  const started = await engine.start({ ...base, actor: "owner" });
  assert.equal(started.replayed, false);
  const replay = await engine.start({ ...base, actor: "owner" });
  assert.equal(replay.replayed, true);
  assert.equal(replay.instanceId, started.instanceId);

  const submitted = await engine.advance({
    tenantId: TENANT, instanceId: started.instanceId, event: "submit", actor: "owner",
  });
  assert.equal(submitted.instance.state, "review");

  const blocked = await engine.advance({
    tenantId: TENANT, instanceId: started.instanceId, event: "approve", actor: "sales",
  });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.guard, "finance_actor");

  const posted = await engine.advance({
    tenantId: TENANT, instanceId: started.instanceId, event: "approve", actor: "accounting",
  });
  assert.equal(posted.accepted, true);
  assert.equal(posted.instance.state, "posted");
  assert.equal(posted.instance.status, "completed");

  const events = [...store.state.outbox.values()].map((event) => event.event_type);
  assert.ok(events.includes("workflow.started"));
  assert.ok(events.includes("close.submitted"));
  assert.ok(events.includes("close.approved"));
  assert.ok(events.includes("workflow.completed"));
});
