// Contabilización derivada: un asiento operativo → un asiento por libro.
// El modo dryRun calcula sin escribir. La escritura es idempotente por
// (tenant, source_type, source_id, ledger_id) y nunca modifica el asiento origen.

import { NextResponse } from "next/server";
import { dbEnabled } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { hasPermission, requirePermission, writeAudit } from "../../../../../lib/erp/permissions";
import {
  accountingError,
  createAccountingService,
  derivePostingPlan,
} from "../../../../../lib/ultra/accounting-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const service = createAccountingService({
      role: ctx.identity.role,
      actorId: ctx.identity.user_id || "",
    });
    const entries = await service.listDerivedEntries(ctx.identity.tenant_id, request.nextUrl.searchParams.get("limit"));
    return NextResponse.json({ entries });
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
  const sourceId = String(body.sourceId || "").trim();
  if (!sourceId) return NextResponse.json({ error: "Falta el id del asiento operativo (sourceId)" }, { status: 400 });

  const dryRun = body.dryRun === true;
  const ledgerCodes = Array.isArray(body.ledgerCodes)
    ? body.ledgerCodes.filter((code) => typeof code === "string" && code.trim())
    : [];
  const rateType = String(body.rateType || "closing");
  const entityId = body.entityId ? String(body.entityId) : null;

  try {
    await requirePermission(ctx, dryRun ? "finance.view" : "journal.post");
    const service = createAccountingService({
      role: ctx.identity.role,
      actorId: ctx.identity.user_id || "",
    });
    const result = await derivePostingPlan({
      service,
      tenantId: ctx.identity.tenant_id,
      sourceId,
      sourceType: body.sourceType || null,
      ledgerCodes,
      rateType,
      entityId,
    });

    if (dryRun) return NextResponse.json({ dryRun: true, ...result });

    const inserted = await service.persistPlan(ctx.identity.tenant_id, result.plan);
    await writeAudit(ctx, "ultra.posting.derive", "derivedEntry", result.source.id, {
      source_type: result.source.source_type,
      ledgers: result.plan.entries.map((entry) => entry.ledger_code),
      inserted: inserted.length,
    });
    return NextResponse.json({ dryRun: false, ...result, inserted }, { status: 201 });
  } catch (error) {
    const safe = accountingError(error);
    return NextResponse.json({ error: safe.publicMessage }, { status: safe.status });
  }
}
