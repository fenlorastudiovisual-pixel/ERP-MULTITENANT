// Adaptador del workflow engine a Postgres/Neon.
// NO ejecuta DDL y NO se importa desde componentes cliente. Solo construye
// queries que se ejecutan dentro de runAsTenant(), con RLS real por tenant.

// El cliente Postgres se importa de forma diferida para que este barrel no
// arrastre dependencias de servidor a componentes cliente.
async function defaultRunner(tenantId, build, role, actorId) {
  const { runAsTenant } = await import("../db.js");
  return runAsTenant(tenantId, build, role, actorId);
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Acepta UUID puro o con prefijo (`wf_<uuid>`) y devuelve null si no aplica. */
export function uuidOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  const match = text.match(UUID_RE);
  return match ? match[0].toLowerCase() : null;
}

const json = (value) => JSON.stringify(value ?? {});
const ts = (value) => (value ? new Date(value).toISOString() : null);
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function mapInstance(row, effects = []) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    definition_key: row.definition_key,
    definition_version: num(row.definition_version),
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    state: row.state,
    status: row.status,
    context: row.context || {},
    idempotency_key: row.idempotency_key,
    attempts: num(row.attempts),
    next_run_at: row.next_run_at ? new Date(row.next_run_at).toISOString() : null,
    error: row.error,
    history: row.history || [],
    pendingEffects: (effects || []).map((effect) => ({
      id: effect.effect_id || effect.id,
      spec: effect.spec || {},
    })),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

/**
 * @param {object} options
 * @param {function} options.runner  Inyectable en tests; por defecto runAsTenant.
 * @param {string} options.role      app.user_role usado por RLS.
 * @param {string} options.actorId   app.actor_id usado por auditoría.
 */
export function createPgWorkflowStore({ runner = defaultRunner, role = "tenant_user", actorId = "" } = {}) {
  if (typeof runner !== "function") throw new Error("createPgWorkflowStore: runner inválido");

  const query = (tenantId, build) => runner(tenantId, build, role, actorId);

  function buildOps(collector) {
    const add = (tenantId, build) => {
      if (collector) {
        collector.push({ tenantId, build });
        return [];
      }
      return query(tenantId, build);
    };

    const ops = {
      async getIdempotency(tenantId, key) {
        const rows = await add(tenantId, (tx) => tx`
          select result
          from public.erp_idempotency_keys
          where tenant_id = ${tenantId}::uuid and key = ${key}
          limit 1
        `);
        return rows?.[0]?.result || null;
      },

      async putIdempotency(tenantId, key, result) {
        return add(tenantId, (tx) => tx`
          insert into public.erp_idempotency_keys (tenant_id, key, scope, result)
          values (${tenantId}::uuid, ${key}, 'workflow', ${json(result)}::jsonb)
          on conflict (tenant_id, key)
          do update set result = excluded.result
        `);
      },

      async getInstance(tenantId, instanceId) {
        const id = uuidOrNull(instanceId);
        if (!id) return null;
        const result = await add(tenantId, (tx) => [
          tx`
            select *
            from public.erp_workflow_instances
            where tenant_id = ${tenantId}::uuid and id = ${id}::uuid
            limit 1
          `,
          tx`
            select effect_id, spec
            from public.erp_workflow_effects
            where tenant_id = ${tenantId}::uuid
              and instance_id = ${id}::uuid
              and status = 'pending'
            order by effect_id asc
          `,
        ]);

        const row = result?.[0]?.[0];
        if (!row) return null;
        return mapInstance(row, result?.[1] || []);
      },

      async putInstance(tenantId, instance) {
        if (!instance?.id) throw new Error("putInstance: instancia sin id");
        const id = uuidOrNull(instance.id);
        if (!id) throw new Error(`putInstance: id no UUID: ${instance.id}`);

        const result = add(tenantId, (tx) => tx`
          insert into public.erp_workflow_instances (
            id, tenant_id, definition_key, definition_version,
            entity_type, entity_id, state, status, context,
            idempotency_key, attempts, next_run_at, error, history, updated_at
          )
          values (
            ${id}::uuid, ${tenantId}::uuid, ${instance.definition_key},
            ${num(instance.definition_version, 1)}, ${instance.entity_type || null},
            ${uuidOrNull(instance.entity_id)}::uuid, ${instance.state}, ${instance.status},
            ${json(instance.context || {})}::jsonb, ${instance.idempotency_key},
            ${num(instance.attempts)}, ${ts(instance.next_run_at)}::timestamptz,
            ${instance.error || null}, ${json(instance.history || [])}::jsonb, now()
          )
          on conflict (tenant_id, id)
          do update set
            definition_key = excluded.definition_key,
            definition_version = excluded.definition_version,
            entity_type = excluded.entity_type,
            entity_id = excluded.entity_id,
            state = excluded.state,
            status = excluded.status,
            context = excluded.context,
            attempts = excluded.attempts,
            next_run_at = excluded.next_run_at,
            error = excluded.error,
            history = excluded.history,
            updated_at = now()
        `);

        for (const pending of instance.pendingEffects || []) {
          add(tenantId, (tx) => tx`
            insert into public.erp_workflow_effects (
              tenant_id, effect_id, instance_id, spec, status, attempts
            )
            values (
              ${tenantId}::uuid, ${pending.id}, ${id}::uuid,
              ${json(pending.spec || {})}::jsonb, 'pending', 0
            )
            on conflict (tenant_id, effect_id) do nothing
          `);
        }

        return result;
      },

      async hasEffect(tenantId, effectId) {
        const rows = await add(tenantId, (tx) => tx`
          select 1 as ok
          from public.erp_workflow_effects
          where tenant_id = ${tenantId}::uuid
            and effect_id = ${effectId}
            and status = 'done'
          limit 1
        `);
        return rows?.[0]?.ok === 1;
      },

      async markEffect(tenantId, record) {
        return add(tenantId, (tx) => tx`
          insert into public.erp_workflow_effects (
            tenant_id, effect_id, instance_id, spec, status, result, error, attempts
          )
          values (
            ${tenantId}::uuid, ${record.effectId}, ${uuidOrNull(record.instanceId)}::uuid,
            ${json(record.spec || {})}::jsonb, ${record.status},
            ${json(record.result ?? null)}::jsonb, ${record.error || null},
            ${num(record.attempts)}
          )
          on conflict (tenant_id, effect_id)
          do update set
            status = excluded.status,
            result = excluded.result,
            error = excluded.error,
            attempts = excluded.attempts,
            created_at = now()
        `);
      },

      async emitOutbox(tenantId, event) {
        const rows = await add(tenantId, (tx) => tx`
          with inserted as (
            insert into public.erp_outbox (
              id, tenant_id, direction, event_type, dedupe_key,
              payload, status, attempts, available_at
            )
            values (
              ${uuidOrNull(event.id)}::uuid, ${tenantId}::uuid, ${event.direction || "out"},
              ${event.event_type}, ${event.dedupe_key}, ${json(event.payload || {})}::jsonb,
              ${event.status || "pending"}, ${num(event.attempts)}, ${ts(event.available_at) || null}::timestamptz
            )
            on conflict (tenant_id, dedupe_key) do nothing
            returning *
          )
          select * from inserted
          union all
          select * from public.erp_outbox
          where tenant_id = ${tenantId}::uuid and dedupe_key = ${event.dedupe_key}
          limit 1
        `);
        return rows?.[0] || null;
      },

      async listDue(tenantId, nowIso, limit = 50) {
        const rows = await add(tenantId, (tx) => tx`
          select
            i.*,
            coalesce((
              select jsonb_agg(
                jsonb_build_object('id', e.effect_id, 'spec', e.spec)
                order by e.effect_id asc
              )
              from public.erp_workflow_effects e
              where e.tenant_id = i.tenant_id
                and e.instance_id = i.id
                and e.status = 'pending'
            ), '[]'::jsonb) as pending_effects
          from public.erp_workflow_instances i
          where i.tenant_id = ${tenantId}::uuid
            and i.status = 'retry'
            and i.next_run_at <= ${ts(nowIso)}::timestamptz
          order by i.next_run_at asc
          limit ${Math.max(1, Math.min(Number(limit) || 50, 500))}
        `);
        return (rows || []).map((row) => mapInstance(row, row.pending_effects || []));
      },
    };

    return ops;
  }

  async function transaction(fn) {
    if (typeof fn !== "function") throw new Error("transaction: función requerida");
    const entries = [];
    await fn(buildOps(entries));

    if (!entries.length) return [];
    const tenantIds = [...new Set(entries.map((entry) => entry.tenantId))];
    if (tenantIds.length !== 1) throw new Error("La transacción mezcla tenants; eso está prohibido");

    return query(tenantIds[0], (tx) => entries.map((entry) => entry.build(tx)));
  }

  return { ...buildOps(null), transaction };
}
