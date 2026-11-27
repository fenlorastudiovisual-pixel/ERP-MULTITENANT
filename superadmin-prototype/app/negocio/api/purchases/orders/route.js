// Pedidos de compra: creación y aprobación. La recepción va en /purchases/receive.

import { NextResponse } from "next/server";
import { dbEnabled } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { requirePermission } from "../../../../../lib/erp/permissions";
import { approvePurchaseOrder, createPurchaseOrder } from "../../../../../lib/erp/purchases";

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
    await requirePermission(ctx, "purchase.create");
    if (body?.action === "approve") {
      if (!body.orderId) return NextResponse.json({ error: "Falta el pedido" }, { status: 400 });
      const order = await approvePurchaseOrder(ctx, body.orderId);
      if (!order) return NextResponse.json({ error: "Pedido no encontrado o ya aprobado" }, { status: 404 });
      return NextResponse.json({ order });
    }
    const order = await createPurchaseOrder(ctx, body);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    const status = error?.status || 500;
    return NextResponse.json({ error: error?.publicMessage || error?.message || String(error) }, { status });
  }
}
