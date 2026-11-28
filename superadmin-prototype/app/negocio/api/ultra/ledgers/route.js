// Configuración del Ultra ERP: libros, reglas, tasas, grupos y miembros.
// Solo lectura. La migración SQL debe estar aplicada para que responda datos.

import { NextResponse } from "next/server";
import { dbEnabled } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { hasPermission } from "../../../../../lib/erp/permissions";
import { accountingError, createAccountingService } from "../../../../../lib/ultra/accounting-service";

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
    return NextResponse.json(config);
  } catch (error) {
    const safe = accountingError(error);
    return NextResponse.json({ error: safe.publicMessage }, { status: safe.status });
  }
}
