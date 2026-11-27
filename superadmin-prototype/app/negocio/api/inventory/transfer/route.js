// Transferencia entre almacenes. Sin asiento contable: el activo sigue siendo del tenant.

import { NextResponse } from "next/server";
import { dbEnabled } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { requirePermission } from "../../../../../lib/erp/permissions";
import { transferStock } from "../../../../../lib/erp/inventory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }
  let body = null;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Datos inválidos" }, { status: 400 }); }
  try {
    await requirePermission(ctx, "stock.transfer");
    const result = await transferStock(ctx, body);
    return NextResponse.json({ transfer: result }, { status: 201 });
  } catch (error) {
    const status = error?.status || 500;
    return NextResponse.json({ error: error?.publicMessage || error?.message || String(error) }, { status });
  }
}
