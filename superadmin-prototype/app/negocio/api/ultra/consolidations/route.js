// Consolidación de grupo sobre los asientos derivados ya calculados.
// No escribe: devuelve el balance agregado con eliminaciones y NCI aplicadas.

import { NextResponse } from "next/server";
import { dbEnabled } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { hasPermission } from "../../../../../lib/erp/permissions";
import {
  accountingError,
  buildConsolidationReport,
  createAccountingService,
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
    const config = await service.listConfiguration(ctx.identity.tenant_id);
    return NextResponse.json({ groups: config.groups, members: config.members });
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
  if (!(await hasPermission(ctx, "finance.view"))) {
    return NextResponse.json({ error: "No tienes permiso para ver finanzas." }, { status: 403 });
  }

  let body = {};
  try { body = (await request.json()) || {}; } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const groupCode = String(body.groupCode || "").trim();
  const date = String(body.date || "").trim();
  if (!groupCode || !date) {
    return NextResponse.json({ error: "Faltan groupCode y date (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const service = createAccountingService({
      role: ctx.identity.role,
      actorId: ctx.identity.user_id || "",
    });
    const result = await buildConsolidationReport({
      service,
      tenantId: ctx.identity.tenant_id,
      groupCode,
      date,
      rateType: String(body.rateType || "closing"),
    });
    return NextResponse.json(result);
  } catch (error) {
    const safe = accountingError(error);
    return NextResponse.json({ error: safe.publicMessage }, { status: safe.status });
  }
}
