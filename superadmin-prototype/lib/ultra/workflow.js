// Motor de workflows duraderos: estados, guards, effects post-commit,
// idempotencia, reintentos y outbox. Inspirado en @nocobase/lifecycle,
// sin depender de su licencia ni de un designer visual.

const TERMINAL_STATES = new Set(["completed", "approved", "rejected", "cancelled"]);

let fallbackCounter = 0;
function defaultId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}_${uuid || `${Date.now().toString(36)}-${(++fallbackCounter).toString(36)}`}`;
}

const stamp = (value = new Date()) => new Date(value).toISOString();

function normalizeGuard(guard) {
  if (typeof guard === "function") return { name: guard.name || "guard", check: guard };
  if (guard && typeof guard.check === "function") return guard;
  throw new Error("Guard inválido: se espera función o { name, check }");
}

/**
 * Definición persistible. Los effects se describen por `type` para poder
 * guardarse en JSON; los handlers se registran al crear el engine.
 */
export function defineWorkflow(definition = {}) {
  const { key, version = 1, initial, states = {}, transitions = [] } = definition;
  if (!key || !initial) throw new Error("Workflow requiere key e initial");
  if (!states[initial]) throw new Error(`Estado inicial desconocido: ${initial}`);
  if (!Array.isArray(transitions) || !transitions.length) throw new Error("Workflow requiere transiciones");

  const stateNames = new Set(Object.keys(states));
  for (const transition of transitions) {
    if (!stateNames.has(transition.from) || !stateNames.has(transition.to)) {
      throw new Error(`Transición inválida: ${transition.from} → ${transition.to}`);
    }
  }

  return Object.freeze({
    idempotencyScope: "entity",
    ...definition,
    version,
    transitions: Object.freeze(
      transitions.map((transition) =>
        Object.freeze({
          ...transition,
          guards: Object.freeze((transition.guards || []).map(normalizeGuard)),
          effects: Object.freeze(transition.effects || []),
        }),
      ),
    ),
  });
}

/**
 * Store requerido (todo con tenant_id):
 *   transaction(fn)
 *   getIdempotency(tenantId, key) -> { result } | null
 *   putIdempotency(tenantId, key, result)
 *   getInstance(tenantId, id)
 *   putInstance(tenantId, instance)
 *   listDue(tenantId, nowIso, limit)
 *   hasEffect(tenantId, effectId) -> boolean  // solo true si status='done'
 *   markEffect(tenantId, record)
 *   emitOutbox(tenantId, event)
 */
export function createWorkflowEngine({ store, handlers = {}, now = () => new Date(), id = defaultId } = {}) {
  if (!store) throw new Error("Workflow requiere store");

  function idempotencyKey(definition, entityType, entityId, explicit) {
    const scope = explicit || `${definition.idempotencyScope}:${entityType}:${entityId}`;
    return `${definition.key}:${definition.version}:${scope}`;
  }

  async function emit(tenantId, event) {
    return store.emitOutbox(tenantId, {
      id: id("out"),
      direction: "out",
      event_type: event.event_type,
      dedupe_key: event.dedupe_key,
      payload: event.payload || {},
      status: "pending",
      attempts: 0,
      available_at: stamp(now()),
    });
  }

  async function runEffects(tenantId, instance) {
    const results = [];

    for (const pending of [...(instance.pendingEffects || [])]) {
      if (await store.hasEffect(tenantId, pending.id)) {
        instance.pendingEffects = instance.pendingEffects.filter((item) => item.id !== pending.id);
        continue;
      }

      const handler = handlers[pending.spec?.type];
      if (!handler) {
        instance.status = "retry";
        instance.error = `Handler no registrado: ${pending.spec?.type}`;
        instance.nextRunAt = stamp(now());
        await store.putInstance(tenantId, instance);
        return { instance, results, error: instance.error };
      }

      try {
        const result = await handler({ tenantId, instance, spec: pending.spec, emit: (event) => emit(tenantId, event) });
        await store.markEffect(tenantId, {
          effectId: pending.id,
          instanceId: instance.id,
          status: "done",
          result: result ?? null,
          attempts: 1,
        });
        instance.pendingEffects = instance.pendingEffects.filter((item) => item.id !== pending.id);
        results.push({ effectId: pending.id, ok: true, result: result ?? null });
      } catch (error) {
        instance.attempts = (instance.attempts || 0) + 1;
        instance.status = "retry";
        instance.error = error?.message || String(error);
        instance.nextRunAt = stamp(new Date(now().getTime() + Math.min(60_000, 1_000 * 2 ** instance.attempts)));
        await store.markEffect(tenantId, {
          effectId: pending.id,
          instanceId: instance.id,
          status: "failed",
          error: instance.error,
          attempts: instance.attempts,
        });
        await store.putInstance(tenantId, instance);
        return { instance, results, error: instance.error };
      }
    }

    instance.status = TERMINAL_STATES.has(instance.state) ? "completed" : "active";
    instance.error = null;
    instance.nextRunAt = null;
    instance.updatedAt = stamp(now());
    await store.putInstance(tenantId, instance);

    if (instance.status === "completed") {
      await emit(tenantId, {
        event_type: "workflow.completed",
        dedupe_key: `${instance.id}:completed:${instance.state}`,
        payload: { instanceId: instance.id, state: instance.state },
      });
    }

    return { instance, results, error: null };
  }

  async function start({ tenantId, definition, entityType, entityId, context = {}, idempotencyKey: explicitKey, actor = "" }) {
    registerDefinition(definition);
    const key = idempotencyKey(definition, entityType, entityId, explicitKey);
    const existing = await store.getIdempotency(tenantId, key);
    if (existing) return { ...existing.result, replayed: true };

    const createdAt = stamp(now());
    const instance = {
      id: id("wf"),
      tenant_id: tenantId,
      definition_key: definition.key,
      definition_version: definition.version,
      entity_type: entityType,
      entity_id: entityId,
      state: definition.initial,
      status: "active",
      context,
      idempotency_key: key,
      attempts: 0,
      next_run_at: null,
      error: null,
      history: [],
      pendingEffects: [],
      createdAt,
      updatedAt: createdAt,
    };

    const result = { instanceId: instance.id, state: instance.state, status: instance.status };

    await store.transaction(async (tx) => {
      await tx.putIdempotency(tenantId, key, result);
      await tx.putInstance(tenantId, instance);
      await tx.emitOutbox(tenantId, {
        id: id("out"),
        direction: "out",
        event_type: "workflow.started",
        dedupe_key: `${instance.id}:started`,
        payload: { instanceId: instance.id, definition: definition.key, entityType, entityId },
        status: "pending",
        attempts: 0,
        available_at: createdAt,
      });
    });

    return { ...result, replayed: false };
  }

  async function advance({ tenantId, instanceId, event, payload = {}, actor = "" }) {
    const instance = await store.getInstance(tenantId, instanceId);
    if (!instance) throw new Error(`Instancia no encontrada: ${instanceId}`);
    if (instance.status === "retry") throw new Error("La instancia está en reintento; usa resume()");

    const definition = handlers.__definitions?.[`${instance.definition_key}:${instance.definition_version}`];
    if (!definition) throw new Error(`Definición no registrada: ${instance.definition_key}`);
    if (!definition.states[instance.state]) throw new Error(`Estado desconocido: ${instance.state}`);

    const transition = definition.transitions.find(
      (item) => item.from === instance.state && item.event === event,
    );
    if (!transition) {
      const error = new Error(`Transición no permitida: ${instance.state} --${event}-->`);
      error.status = 409;
      throw error;
    }

    for (const guard of transition.guards) {
      const allowed = await guard.check({ tenantId, instance, event, payload, actor });
      if (!allowed) return { accepted: false, reason: "guard", guard: guard.name, instance };
    }

    const step = (instance.history?.length || 0) + 1;
    const from = instance.state;
    const to = transition.to;
    instance.state = to;
    instance.history = [...(instance.history || []), { step, event, from, to, at: stamp(now()), actor }];
    instance.pendingEffects = (transition.effects || []).map((spec, index) => ({
      id: `${instance.id}:${step}:${index}`,
      spec,
    }));
    instance.updatedAt = stamp(now());

    await store.transaction(async (tx) => {
      await tx.putInstance(tenantId, instance);
      await tx.emitOutbox(tenantId, {
        id: id("out"),
        direction: "out",
        event_type: "workflow.transitioned",
        dedupe_key: `${instance.id}:${step}`,
        payload: { instanceId: instance.id, event, from, to },
        status: "pending",
        attempts: 0,
        available_at: stamp(now()),
      });
    });

    const executed = await runEffects(tenantId, instance);
    return { accepted: true, instance: executed.instance, results: executed.results, error: executed.error };
  }

  async function resume({ tenantId, instanceId }) {
    const instance = await store.getInstance(tenantId, instanceId);
    if (!instance) throw new Error(`Instancia no encontrada: ${instanceId}`);
    if (instance.status !== "retry") return { instance, results: [], error: null };
    return runEffects(tenantId, instance);
  }

  async function runDue({ tenantId, limit = 50 }) {
    const due = await store.listDue(tenantId, stamp(now()), limit);
    const results = [];
    for (const instance of due) results.push(await resume({ tenantId, instanceId: instance.id }));
    return results;
  }

  function registerDefinition(definition) {
    handlers.__definitions = handlers.__definitions || {};
    handlers.__definitions[`${definition.key}:${definition.version}`] = definition;
    return definition;
  }

  return { start, advance, resume, runDue, registerDefinition, emit, handlers };
}

export { TERMINAL_STATES };
