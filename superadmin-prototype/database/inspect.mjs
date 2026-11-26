// Inspección de solo lectura de Neon: conteos por tabla y resumen del estado.
// Uso: npm run db:inspect

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // Sin .env.local: se usa DATABASE_URL del entorno.
  }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en .env.local.");
  process.exit(1);
}

const sql = neon(url);

const tableNames = [
  "auth.users", "public.profiles", "public.plans", "public.modules",
  "public.plan_modules", "public.plan_limits", "public.feature_flags", "public.plan_flags",
  "public.tenants", "public.subscriptions", "public.invoices",
  "public.demo_scenarios", "public.demo_tenants", "public.demo_leads",
  "public.languages", "public.translations", "public.leads", "public.platform_config",
  "public.app_state", "public.audit_log",
];

console.log("Conteo de tablas en Neon:");
for (const name of tableNames) {
  const [schema, table] = name.split(".");
  const info = await sql`
    select count(*)::int as total
    from information_schema.tables
    where table_schema = ${schema} and table_name = ${table}
  `;
  if (!info[0]?.total) {
    console.log(`    -  ${name}  (no existe)`);
    continue;
  }
  const result = await sql.query(`select count(*)::int as total from ${name}`);
  console.log(`  ${String(result[0]?.total ?? 0).padStart(5)}  ${name}`);
}

const dbInfo = await sql`select current_database() as db, current_user as usr`;
const roleInfo = await sql`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`;
console.log(`\nBD: ${dbInfo[0]?.db} · usuario: ${dbInfo[0]?.usr}`);
console.log(`   BYPASSRLS=${roleInfo[0]?.rolbypassrls} SUPERUSER=${roleInfo[0]?.rolsuper}`);

const rls = await sql`
  select relname, relrowsecurity as enabled, relforcerowsecurity as forced
  from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r'
  order by relname
`;
const unprotected = rls.filter((table) => !table.enabled || !table.forced);
console.log(`   RLS activo y forzado en ${rls.length - unprotected.length}/${rls.length} tablas public`);
if (unprotected.length) console.log(`   Sin FORCE: ${unprotected.map((table) => table.relname).join(", ")}`);

const admins = await sql`select email, active from auth.users order by email`;
console.log(`Usuarios de identidad: ${admins.length ? admins.map((u) => `${u.email}${u.active ? "" : " (inactivo)"}`).join(", ") : "ninguno"}`);

const state = await sql`select payload, updated_at from public.app_state where id = 'main'`;
if (!state[0]) {
  console.log("\napp_state: sin fila 'main'.");
} else {
  const payload = state[0].payload || {};
  console.log(`\napp_state: actualizado ${state[0].updated_at}`);
  console.log(`  version=${payload.__stateVersion ?? 1} producto=${payload.branding?.product ?? "(sin marca)"}`);
  console.log(`  tenants=${payload.tenants?.length ?? 0} planes=${payload.plans?.length ?? 0} demos=${payload.demos?.length ?? 0}`);
  console.log(`  usuarios=${payload.users?.length ?? 0} idiomas=${payload.languages?.length ?? 0} traducciones=${payload.translations?.length ?? 0} leads=${payload.leads?.length ?? 0}`);
}
