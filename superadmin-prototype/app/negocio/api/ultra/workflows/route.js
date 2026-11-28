// Control plane de workflows duraderos. Solo se aceptan definiciones,
// acciones y eventos registrados en el servidor; el body no elige código.

import { NextResponse } from "next/server";
import { dbEnabled } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { hasPermission, requirePermission, writeAudit } from "../../../../../lib/erp/permissions";
import { accountingError } from "../../../../../lib/ultra/accounting-service";
import { createPgWorkflowStore, uuidOrNull } from "../../../../../lib/ultra/workflow-store.js";
import {
  ALLOWED_ACTIONS,
  ALLOWED_ENTITY_TYPES,
  ALLOWED_WORKFLOW_KEYS,
  CLOSE_WORKFLOW,
  createUltraWorkflowEngine,
  WORKFLOWS,
  workflowEvents,
} from "../../../../../lib/ultra/workflow-definitions.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTEXT_KEYS = ["source_type", "source_id", "group_code", "date", "note"];

function sanitizeContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const key of CONTEXT_KEYS) {
    if (value[key] === undefined || value[key] === null) continue;
    output[key] = String(value[key]).slice(0, 200);
  }
  return output;
}

function makeStore(ctx) {
  return createPgWorkflowStore({
    role: ctx.identity.role,
    actorId: ctx.identity.user_id || "",
  });
}

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }
  if (!(await hasPermission(ctx, "finance.view"))) {
    return NextResponse.json({ error: "No tienes permiso para ver finanzas." }, { status: 403 });
  }

  try {
    const due = await makeStore(ctx).listDue(
      ctx.identity.tenant_id,
      new Date().toISOString(),
      20,
    );
    return NextResponse.json({
      due,
      definitions: ALLOWED_WORKFLOW_KEYS.map((key) => ({
        key,
        states: Object.keys(WORKFLOWS[key].states),
        events: workflowEvents(key),
      })),
    });
  } catch (error) {
    const safe = accountingError(error);
    return NextResponse.json({ error: safe.publicMessage }, { status: safe.status });
  }
}

export async function POST(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }

  let body = {};
  try { body = (await request.json()) || {}; } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const action = String(body.action || "").trim().toLowerCase();
  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Acción no permitida: ${action || "(vacía)"}` }, { status: 400 });
  }

  const key = String(body.workflowKey || CLOSE_WORKFLOW.key).trim();
  if (!ALLOWED_WORKFLOW_KEYS.includes(key)) {
    return NextResponse.json({ error: `Workflow no registrado: ${key}` }, { status: 403 });
  }
  const definition = WORKFLOWS[key];
  const actor = ctx.identity.role;
  const tenantId = ctx.identity.tenant_id;

  try {
    await requirePermission(ctx, "journal.post");
    const store = makeStore(ctx);
    const engine = createUltraWorkflowEngine({ store });
    let result;

    if (action === "start") {
      const entityType = String(body.entityType || "").trim();
      const entityId = String(body.entityId || "").trim();
      if (!ALLOWED_ENTITY_TYPES.includes(entityType) || !entityId) {
        return NextResponse.json({ error: "entityType o entityId inválidos" }, { status: 400 });
      }
      result = await engine.start({
        tenantId,
        definition,
        entityType,
        entityId,
        context: sanitizeContext(body.context),
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey).slice(0, 200) : undefined,
        actor,
      });
    } else if (action === "advance") {
      const instanceId = uuidOrNull(body.instanceId);
      const event = String(body.event || "").trim();
      if (!instanceId || !workflowEvents(key).includes(event)) {
        return NextResponse.json({ error: "instanceId o event inválidos" }, { status: 400 });
      }
      result = await engine.advance({ tenantId, instanceId, event, payload: sanitizeContext(body.payload), actor });
      if (result.accepted === false) {
        return NextResponse.json({ ...result, error: `Guard rechazó la transición: ${result.guard}` }, { status: 409 });
      }
    } else if (action === "resume") {
      const instanceId = uuidOrNull(body.instanceId);
      if (!instanceId) return NextResponse.json({ error: "instanceId inválido" }, { status: 400 });
      result = await engine.resume({ tenantId, instanceId });
    } else {
      result = { instances: await engine.runDue({ tenantId, limit: 20 }) };
    }

    await writeAudit(ctx, `ultra.workflow.${action}`, "workflowInstance", result.instanceId || "run_due", {
      workflow: key,
      actor_role: actor,
    });
    return NextResponse.json(result, { status: action === "start" ? 201 : 200 });
  } catch (error) {
    const safe = accountingError(error);
    return NextResponse.json({ error: safe.publicMessage }, { status: safe.status });
  }
}
