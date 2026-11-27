// Asientos contables del libro único. Solo lectura; los asientos se generan desde documentos.

import { NextResponse } from "next/server";
import { dbEnabled, runAsTenant } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";
import { hasPermission } from "../../../../../lib/erp/permissions";

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
  const tenantId = ctx.identity.tenant_id;
  try {
    const [entries, accounts] = await runAsTenant(tenantId, (tx) => [
      tx`
        select id::text as id, number, entry_date, description, source_type,
               total_debit::float as total_debit, total_credit::float as total_credit, status
        from public.journal_entries
        where tenant_id = ${tenantId}::uuid
        order by entry_date desc, created_at desc limit 60
      `,
      tx`
        select code, name, account_type from public.accounts
        where tenant_id = ${tenantId}::uuid and active order by code
      `,
    ], ctx.identity.role, ctx.identity.user_id);
    return NextResponse.json({ entries, accounts });
  } catch (error) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
