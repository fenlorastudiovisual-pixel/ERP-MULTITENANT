// Comprobación rápida de la conexión a Neon. Abrir /api/health en el navegador.

import { NextResponse } from "next/server";
import { dbHealth } from "../../../lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const health = await dbHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
