// Persistencia del estado del Super Admin en Postgres (Neon).
// GET  -> lee el estado guardado; 503 si no hay DATABASE_URL (la app usa localStorage).
// PUT  -> guarda el estado completo.
// DELETE -> restablece el estado vacío.

import { NextResponse } from "next/server";
import { dbEnabled, runAsSuperAdmin } from "../../../lib/db";
import { getSessionUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    { mode: "neon", error: "No autorizado. Inicia sesión como Super Admin." },
    { status: 401 },
  );
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function forbidden() {
  return NextResponse.json({ mode: "neon", error: "Origen no permitido" }, { status: 403 });
}

function serverError(error) {
  return NextResponse.json(
    { mode: "neon", error: error?.message || String(error) },
    { status: 500 },
  );
}

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ mode: "local", state: null }, { status: 503 });
  if (!(await getSessionUser(request))) return unauthorized();
  try {
    const rows = await runAsSuperAdmin((tx) => tx`select payload from public.app_state where id = 'main'`);
    return NextResponse.json({ mode: "neon", state: rows[0]?.payload ?? null });
  } catch (error) {
    return serverError(error);
  }
}

export async function PUT(request) {
  if (!dbEnabled) return NextResponse.json({ mode: "local", error: "Sin base de datos" }, { status: 503 });
  if (!sameOrigin(request)) return forbidden();
  if (!(await getSessionUser(request))) return unauthorized();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ mode: "neon", error: "JSON inválido" }, { status: 400 });
  }
  const payload = body?.state;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ mode: "neon", error: "Falta el objeto state" }, { status: 400 });
  }
  try {
    const rows = await runAsSuperAdmin((tx) => tx`
      insert into public.app_state (id, payload)
      values ('main', ${JSON.stringify(payload)}::jsonb)
      on conflict (id) do update
        set payload = excluded.payload, updated_at = now()
      returning updated_at
    `);
    return NextResponse.json({ ok: true, mode: "neon", updatedAt: rows[0]?.updated_at });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request) {
  if (!dbEnabled) return NextResponse.json({ mode: "local", error: "Sin base de datos" }, { status: 503 });
  if (!sameOrigin(request)) return forbidden();
  if (!(await getSessionUser(request))) return unauthorized();
  try {
    await runAsSuperAdmin((tx) => tx`update public.app_state set payload = '{}'::jsonb, updated_at = now() where id = 'main'`);
    return NextResponse.json({ ok: true, mode: "neon" });
  } catch (error) {
    return serverError(error);
  }
}
