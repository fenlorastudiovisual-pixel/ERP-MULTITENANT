import test from "node:test";
import assert from "node:assert/strict";
import { createWorkflowEngine, defineWorkflow } from "./workflow.js";

const TENANT = "22222222-2222-2222-2222-222222222222";

function createMemoryStore() {
  const state = {
    idempotency: new Map(),
    instances: new Map(),
    effects: new Map(),
    outbox: new Map(),
  };
  const store = {
    transaction: async (fn) => fn(store),
    getIdempotency: async (tenantId, key) => state.idempotency.get(`${tenantId}:${key}`) || null,
    putIdempotency: async (tenantId, key, result) => {
      state.idempotency.set(`${tenantId}:${key}`, { result });
    },
    getInstance: async (tenantId, id) => {
      const instance = state.instances.get(`${tenantId}:${id}`);
      return instance || null;
    },
    putInstance: async (tenantId, instance) => {
      state.instances.set(`${tenantId}:${instance.id}`, instance);
    },
    listDue: async (tenantId, nowIso, limit) =>
      [...state.instances.values()]
        .filter((item) => item.tenant_id === tenantId && item.status === "retry" && item.next_run_at && item.next_run_at <= nowIso)
        .slice(0, limit),
    hasEffect: async (tenantId, effectId) => state.effects.get(`${tenantId}:${effectId}`)?.status === "done",
    markEffect: async (tenantId, record) => {
      state.effects.set(`${tenantId}:${record.effectId}`, record);
    },
    emitOutbox: async (tenantId, event) => {
      const key = `${tenantId}:${event.dedupe_key}`;
      if (state.outbox.has(key)) return state.outbox.get(key);
      const stored = { ...event, tenant_id: tenantId };
      state.outbox.set(key, stored);
      return stored;
    },
  };
  return { store, state };
}

function approvalDefinition() {
  return defineWorkflow({
    key: "approval",
    initial: "draft",
    states: { draft: {}, sent: {}, approved: {} },
    transitions: [
      { from: "draft", event: "submit", to: "sent", effects: [{ type: "notify" }] },
      {
        from: "sent",
        event: "approve",
        to: "approved",
        guards: [{ name: "monto", check: async ({ payload }) => Number(payload.amount) <= 1000 }],
        effects: [{ type: "post" }],
      },
    ],
  });
}

test("start es idempotente y emite una sola vez", async () => {
  const { store, state } = createMemoryStore();
  const engine = createWorkflowEngine({ store, handlers: {} });
  const definition = approvalDefinition();

  const first = await engine.start({
    tenantId: TENANT,
    definition,
    entityType: "invoice",
    entityId: "inv-1",
    idempotencyKey: "invoice-inv-1",
  });
  const second = await engine.start({
    tenantId: TENANT,
    definition,
    entityType: "invoice",
    entityId: "inv-1",
    idempotencyKey: "invoice-inv-1",
  });

  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(second.instanceId, first.instanceId);
  assert.equal(state.instances.size, 1);
  assert.equal(state.outbox.size, 1);
});

test("guard rechaza la transición sin cambiar el estado", async () => {
  const { store } = createMemoryStore();
  const engine = createWorkflowEngine({ store, handlers: { notify: async () => "ok", post: async () => "ok" } });
  const definition = approvalDefinition();
  const started = await engine.start({ tenantId: TENANT, definition, entityType: "invoice", entityId: "inv-2" });

  const submitted = await engine.advance({ tenantId: TENANT, instanceId: started.instanceId, event: "submit" });
  assert.equal(submitted.instance.state, "sent");

  const rejected = await engine.advance({
    tenantId: TENANT,
    instanceId: started.instanceId,
    event: "approve",
    payload: { amount: 2000 },
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, "guard");
  assert.equal(rejected.instance.state, "sent");
});

test("effect fallido pasa a retry y resume completa el workflow", async () => {
  const { store, state } = createMemoryStore();
  let notifyCalls = 0;
  const engine = createWorkflowEngine({
    store,
    handlers: {
      notify: async () => {
        notifyCalls += 1;
        if (notifyCalls === 1) throw new Error("SMTP caído");
        return "enviado";
      },
      post: async () => "asiento publicado",
    },
  });
  const definition = approvalDefinition();
  const started = await engine.start({ tenantId: TENANT, definition, entityType: "invoice", entityId: "inv-3" });

  const submitted = await engine.advance({ tenantId: TENANT, instanceId: started.instanceId, event: "submit" });
  assert.equal(submitted.instance.status, "retry");
  assert.match(submitted.error, /SMTP/);

  const resumed = await engine.resume({ tenantId: TENANT, instanceId: started.instanceId });
  assert.equal(resumed.instance.state, "sent");
  assert.equal(resumed.instance.status, "active");
  assert.equal(notifyCalls, 2);

  const approved = await engine.advance({
    tenantId: TENANT,
    instanceId: started.instanceId,
    event: "approve",
    payload: { amount: 900 },
  });
  assert.equal(approved.instance.state, "approved");
  assert.equal(approved.instance.status, "completed");

  const completedEvents = [...state.outbox.values()].filter((item) => item.event_type === "workflow.completed");
  assert.equal(completedEvents.length, 1);
});
