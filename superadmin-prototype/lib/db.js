// Cliente Postgres de Neon (servidor únicamente). Nunca importar desde componentes cliente.
// Todas las consultas de negocio pasan por runInSession(), que fija el contexto RLS
// (app.tenant_id / app.user_role) dentro de la misma transacción.

import { neon } from "@neondatabase/serverless";

// DATABASE_APP_URL usa un rol sin BYPASSRLS: las policies RLS se aplican de verdad.
// DATABASE_URL queda como respaldo y para tareas administrativas (scripts de database/).
const connectionString = process.env.DATABASE_APP_URL || process.env.DATABASE_URL || "";

export const dbEnabled = Boolean(connectionString);

let cachedSql = null;

export function getSql() {
  if (!connectionString) {
    throw new Error("DATABASE_URL no configurada. Copia .env.example a .env.local y pega la connection string de Neon.");
  }
  if (!cachedSql) cachedSql = neon(connectionString);
  return cachedSql;
}

/**
 * Ejecuta una o más consultas dentro de una transacción con contexto de sesión.
 * `build(tx)` debe devolver una (o varias) query etiquetada; NO debe ejecutarla.
 * Ejemplo:
 *   const rows = await runAsSuperAdmin((tx) => tx`select * from public.tenants`);
 */
export async function runInSession({ tenantId = "", role = "tenant_user", actorId = "" } = {}, build) {
  const sql = getSql();
  const results = await sql.transaction((tx) => {
    const built = build(tx);
    const queries = Array.isArray(built) ? built : [built];
    return [
      tx`select set_config('app.tenant_id', ${String(tenantId)}, true)`,
      tx`select set_config('app.user_role', ${String(role)}, true)`,
      tx`select set_config('app.actor_id', ${String(actorId)}, true)`,
      ...queries,
    ];
  });
  return results.length === 4 ? results[3] : results.slice(3);
}

export const runAsSuperAdmin = (build, actorId = "") =>
  runInSession({ tenantId: "", role: "super_admin", actorId }, build);

export const runAsTenant = (tenantId, build, role = "tenant_user", actorId = "") =>
  runInSession({ tenantId, role, actorId }, build);

export async function dbHealth() {
  if (!dbEnabled) {
    return { ok: false, mode: "local", reason: "DATABASE_URL no configurada" };
  }
  const started = Date.now();
  try {
    const results = await getSql().transaction((tx) => [
      tx`select 1 as ok`,
      tx`select current_database() as database, current_user as usr, version() as version`,
    ]);
    return {
      ok: results[0][0]?.ok === 1,
      mode: "neon",
      latencyMs: Date.now() - started,
      database: results[1][0]?.database,
      user: results[1][0]?.usr,
      version: results[1][0]?.version,
    };
  } catch (error) {
    return { ok: false, mode: "neon", error: error?.message || String(error) };
  }
}
