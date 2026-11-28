import test from "node:test";
import assert from "node:assert/strict";
import { createPgWorkflowStore, uuidOrNull } from "./workflow-store.js";

const TENANT = "88888888-8888-8888-8888-888888888888";
const OTHER = "99999999-9999-9999-9999-999999999999";
const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function fakeRunner(calls) {
  return (tenantId, build, role, actorId) => {
    const tag = (strings, ...values) => ({ text: strings.join("?"), values });
    const built = build(tag);
    calls.push({ tenantId, role, actorId, built });
    if (Array.isArray(built)) return built.map(() => []);
    return [];
  };
}

function instance() {
  return {
    id: UUID,
    tenant_id: TENANT,
    definition_key: "approval",
    definition_version: 1,
    entity_type: "invoice",
    entity_id: null,
    state: "draft",
    status: "active",
    context: { amount: 1190 },
    idempotency_key: "approval:1:invoice:FV-1",
    attempts: 0,
    next_run_at: null,
    error: null,
    history: [],
    pendingEffects: [{ id: `${UUID}:1:0`, spec: { type: "notify" } }],
  };
}

test("uuidOrNull acepta UUID con prefijo y rechaza texto arbitrario", () => {
  assert.equal(uuidOrNull(UUID), UUID);
  assert.equal(uuidOrNull(`wf_${UUID}`), UUID);
  assert.equal(uuidOrNull("FV-1"), null);
  assert.equal(uuidOrNull(null), null);
});

test("transaction compila todas las operaciones en una sola llamada y un solo tenant", async () => {
  const calls = [];
  const store = createPgWorkflowStore({ runner: fakeRunner(calls), role: "admin", actorId: "u1" });

  await store.transaction(async (tx) => {
    await tx.putIdempotency(TENANT, "key-1", { instanceId: UUID });
    await tx.putInstance(TENANT, instance());
    await tx.emitOutbox(TENANT, {
      id: UUID,
      direction: "out",
      event_type: "workflow.started",
      dedupe_key: "started-1",
      payload: {},
      status: "pending",
      attempts: 0,
      available_at: "2026-11-27T00:00:00.000Z",
    });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].tenantId, TENANT);
  assert.equal(calls[0].role, "admin");
  assert.equal(calls[0].actorId, "u1");
  assert.equal(calls[0].built.length, 4); // idempotencia + instancia + effect + outbox
  assert.match(calls[0].built[0].text, /erp_idempotency_keys/);
  assert.match(calls[0].built[1].text, /erp_workflow_instances/);
  assert.match(calls[0].built[2].text, /erp_workflow_effects/);
  assert.match(calls[0].built[3].text, /erp_outbox/);
});

test("transaction rechaza mezclar tenants", async () => {
  const calls = [];
  const store = createPgWorkflowStore({ runner: fakeRunner(calls) });
  await assert.rejects(
    () => store.transaction(async (tx) => {
      await tx.putIdempotency(TENANT, "k", { ok: true });
      await tx.putIdempotency(OTHER, "k", { ok: true });
    }),
    /mezcla tenants/,
  );
});

test("las consultas de idempotencia y efectos filtran por tenant", async () => {
  const calls = [];
  const store = createPgWorkflowStore({ runner: fakeRunner(calls) });
  await store.getIdempotency(TENANT, "k");
  await store.hasEffect(TENANT, `${UUID}:1:0`);
  await store.listDue(TENANT, "2026-11-27T00:00:00.000Z", 10);

  assert.match(calls[0].built.text, /tenant_id = \?::uuid/);
  assert.match(calls[1].built.text, /status = 'done'/);
  assert.match(calls[2].built.text, /i.status = 'retry'/);
});
