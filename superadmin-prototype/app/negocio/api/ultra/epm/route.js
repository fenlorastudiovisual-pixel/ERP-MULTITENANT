// EPM y tesorería del Ultra ERP: presupuestos vs. real, posición de caja y
// previsión. Lectura con finance.view; escritura con journal.post.
// El tenant siempre viene de la sesión, nunca del body.

import { NextResponse } from "next/server";
import { dbEnabled } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { hasPermission, requirePermission, writeAudit } from "../../../../../lib/erp/permissions";
import { accountingError, createEpmService } from "../../../../../lib/ultra/epm-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseDimensions(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function serviceFor(ctx) {
  return createEpmService({
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

  const params = request.nextUrl.searchParams;
  const view = String(params.get("view") || "budgets");
  const tenantId = ctx.identity.tenant_id;

  try {
    const service = serviceFor(ctx);
    if (view === "comparison") {
      const budget = await service.getBudget(tenantId, params.get("budgetId"));
      const report = await service.compareBudgetFor(tenantId, budget, {
        dimensions: parseDimensions(params.get("dimensions")),
        currency: params.get("currency") || undefined,
      });
      return NextResponse.json({ budgetId: budget.id, ...report });
    }
    if (view === "cash") {
      return NextResponse.json({ positions: await service.listCashPositions(tenantId, params.get("limit")) });
    }
    if (view === "forecast") {
      return NextResponse.json({ forecasts: await service.listForecasts(tenantId, params.get("limit")) });
    }
    if (view !== "budgets") {
      return NextResponse.json({ error: "Vista no soportada" }, { status: 400 });
    }
    return NextResponse.json({ budgets: await service.listBudgets(tenantId, params.get("limit")) });
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
  const action = String(body.action || "");
  if (!["budget", "cash", "forecast"].includes(action)) {
    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  }

  try {
    await requirePermission(ctx, "journal.post");
    const service = serviceFor(ctx);
    const tenantId = ctx.identity.tenant_id;

    if (action === "budget") {
      const saved = await service.saveBudget(tenantId, body);
      await writeAudit(ctx, "ultra.epm.budget.save", "budget", saved.id, {
        code: saved.code, period: saved.period, lines: saved.lines.length,
      });
      return NextResponse.json({ budget: saved }, { status: 201 });
    }
    if (action === "cash") {
      const saved = await service.saveCashPosition(tenantId, body);
      await writeAudit(ctx, "ultra.epm.cash.save", "cashPosition", saved.id, {
        date: saved.date, currency: saved.currency, closing: saved.closing,
      });
      return NextResponse.json({ position: saved }, { status: 201 });
    }
    const saved = await service.saveForecast(tenantId, body);
    await writeAudit(ctx, "ultra.epm.forecast.save", "forecast", saved.entity_id, {
      method: saved.method, periods: saved.periods.length,
    });
    return NextResponse.json({ forecast: saved }, { status: 201 });
  } catch (error) {
    const safe = accountingError(error);
    return NextResponse.json({ error: safe.publicMessage }, { status: safe.status });
  }
}
