// Verifica que RLS se aplica de verdad con el rol de la app.
// Uso: npm run db:rls-check

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { uuidFor } from "../lib/state-sync.js";

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* sin .env.local */ }
}

loadEnv();

const url = process.env.DATABASE_APP_URL;
if (!url) {
  console.error("Falta DATABASE_APP_URL. Ejecuta: node database/setup-app-role.mjs");
  process.exit(1);
}

const sql = neon(url);
const role = await sql`select current_user as name, rolbypassrls from pg_roles where rolname = current_user`;
const openState = await sql`select count(*)::int as n from public.app_state`;
const adminState = await sql.transaction((tx) => [
  tx`select set_config('app.user_role', 'super_admin', true)`,
  tx`select count(*)::int as n from public.app_state`,
]);
const openTenants = await sql`select count(*)::int as n from public.tenants`;
const oneTenant = await sql.transaction((tx) => [
  tx`select set_config('app.tenant_id', ${uuidFor("tenant:t1")}, true)`,
  tx`select count(*)::int as n from public.tenants`,
]);

const ok = role[0]?.rolbypassrls === false
  && openState[0]?.n === 0 && adminState[1]?.[0]?.n === 1
  && openTenants[0]?.n === 0 && oneTenant[1]?.[0]?.n === 1;

console.log(`Rol ${role[0]?.name}: BYPASSRLS=${role[0]?.rolbypassrls}`);
console.log(`app_state sin contexto=${openState[0]?.n} · como super_admin=${adminState[1]?.[0]?.n}`);
console.log(`tenants sin contexto=${openTenants[0]?.n} · como t1=${oneTenant[1]?.[0]?.n}`);
console.log(ok ? "OK. RLS se aplica correctamente." : "ERROR. Revisa el rol y las policies.");
process.exit(ok ? 0 : 1);
