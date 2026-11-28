// Sincroniza SOLO los cambios de precio pendientes del piloto hacia la Supabase de Samjuro.
// Reglas: sin DELETE, sin TRUNCATE, sin DDL; una sola columna por tabla; lote máximo 50.
// La credencial de escritura se lee de SUPABASE_WRITE_URL (secreto; nunca se versiona).

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { dbEnabled, runAsTenant } from "../../../../../lib/db";
import { resolveBusinessContext } from "../../../../../lib/tenant-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BATCH = 50;
const TARGETS = {
  presentaciones: { column: "precio" },
  productos: { column: "precio_referencia" },
};

const safeError = (error) => String(error?.message || error).slice(0, 300);

export async function GET(request) {
  if (!dbEnabled) return NextResponse.json({ error: "Sin base de datos" }, { status: 503 });
  const ctx = await resolveBusinessContext(request);
  if (ctx.error) {
    const { status, ...body } = ctx.error;
    return NextResponse.json(body, { status });
  }
  const tenantId = ctx.identity.tenant_id;
  try {
    const rows = await runAsTenant(tenantId, (tx) => [
      tx`
        select id::text, sku, source_table, column_name,
               old_price::float as old_price, new_price::float as new_price,
               status, attempts, last_error, created_at, synced_at
        from public.samjuro_price_sync
        where tenant_id = ${tenantId}::uuid
        order by case status when 'pending' then 0 when 'failed' then 1 else 2 end,
                 created_at desc
        limit 100
      `,
      tx`
        select status, count(*)::int as total
        from public.samjuro_price_sync where tenant_id = ${tenantId}::uuid
        group by status
      `,
    ], ctx.role, ctx.identity.user_id);
    return NextResponse.json({
      changes: rows[0],
      summary: Object.fromEntries(rows[1].map((r) => [r.status, r.total])),
      configured: Boolean(process.env.SUPABASE_WRITE_URL),
      targets: TARGETS,
    });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
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
  try { body = (await request.json()) || {}; } catch { body = {}; }
  const dryRun = body.dryRun === true;
  const tenantId = ctx.identity.tenant_id;

  try {
    const pending = await runAsTenant(tenantId, (tx) => tx`
      select id::text, sku, source_table, source_row_id::text as source_row_id,
             column_name, new_price::float as new_price
      from public.samjuro_price_sync
      where tenant_id = ${tenantId}::uuid and status = 'pending'
      order by created_at asc
      limit ${MAX_BATCH}::int
    `, ctx.role, ctx.identity.user_id);

    const result = { pending: pending.length, processed: 0, synced: 0, failed: 0, errors: [], dryRun };
    if (dryRun || !pending.length) return NextResponse.json(result);

    const writeUrl = process.env.SUPABASE_WRITE_URL;
    if (!writeUrl) {
      return NextResponse.json({
        ...result,
        error: "SUPABASE_WRITE_URL no está configurada: no se escribió nada en Supabase",
      }, { status: 503 });
    }
    const supa = neon(writeUrl, { fetchConnectionCache: true });

    for (const change of pending) {
      const target = TARGETS[change.source_table];
      const column = TARGETS[change.source_table]?.column;
      if (!target || column !== change.column_name || !/^[0-9a-f-]{36}$/.test(change.source_row_id)) {
        await runAsTenant(tenantId, (tx) => tx`
          update public.samjuro_price_sync
          set status = 'failed', attempts = attempts + 1,
              last_error = 'Destino no permitido', synced_at = null
          where tenant_id = ${tenantId}::uuid and id = ${change.id}::uuid
        `, ctx.role, ctx.identity.user_id);
        result.failed += 1;
        result.errors.push({ sku: change.sku, error: "Destino no permitido" });
        continue;
      }

      result.processed += 1;
      try {
        // SQL fijo por whitelist: ningún valor del cliente se usa como identificador.
        const statement = `update public.${change.source_table} set ${column} = $1 where id = $2::uuid returning id`;
        await supa.transaction(async (tx) => {
          const updated = await tx.query(statement, [change.new_price, change.source_row_id]);
          if (!updated.rows.length) throw new Error("No se encontró la fila destino en Supabase");
        });

        await runAsTenant(tenantId, (tx) => tx`
          update public.samjuro_price_sync
          set status = 'synced', attempts = attempts + 1,
              last_error = null, synced_at = now()
          where tenant_id = ${tenantId}::uuid and id = ${change.id}::uuid
        `, ctx.role, ctx.identity.user_id);

        await runAsTenant(tenantId, (tx) => tx`
          insert into public.audit_log
            (tenant_id, actor_role, action, object_type, object_id, reason, metadata)
          values
            (${tenantId}::uuid, ${ctx.role}, 'samjuro_price_synced', 'item', ${change.sku},
             'Precio sincronizado a la Supabase de Samjuro (solo columna autorizada)',
             jsonb_build_object('table', ${change.source_table}, 'column', ${column},
                                'price', ${change.new_price}, 'row_id', ${change.source_row_id}))
        `, ctx.role, ctx.identity.user_id);
        result.synced += 1;
      } catch (error) {
        const message = safeError(error);
        await runAsTenant(tenantId, (tx) => tx`
          update public.samjuro_price_sync
          set status = 'failed', attempts = attempts + 1,
              last_error = ${message}, synced_at = null
          where tenant_id = ${tenantId}::uuid and id = ${change.id}::uuid
        `, ctx.role, ctx.identity.user_id);
        result.failed += 1;
        result.errors.push({ sku: change.sku, error: message });
      }
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
