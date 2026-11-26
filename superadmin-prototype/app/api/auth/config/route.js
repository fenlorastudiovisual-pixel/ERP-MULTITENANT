// Indica al cliente qué mecanismo de acceso está activo.

import { NextResponse } from "next/server";
import { accessEnabled } from "../../../../lib/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ access: accessEnabled });
}
