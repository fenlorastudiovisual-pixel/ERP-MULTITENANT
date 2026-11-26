// Backfill único: completa el correo de acceso de los negocios guardados antes
// de que existiera ese campo y vuelve a sincronizar las tablas operativas.
// Idempotente: solo toca negocios sin correo. Uso: npm run db:backfill-email

import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // Sin .env.local: se usa DATABASE_URL del entorno.
  }
}

loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local.");
  process.exit(1);
}

const { TENANTS_SEED } = await import("../lib/data.js");
const { runAsSuperAdmin } = await import("../lib/db.js");
const { buildSyncQueries } = await import("../lib/state-sync.js");

const rows = await runAsSuperAdmin((tx) => tx`select payload from public.app_state where id = 'main'`);
const payload = rows[0]?.payload;
if (!payload || typeof payload !== "object") {
  console.error("No hay estado en public.app_state. Abre el ERP y guarda una vez antes de migrar.");
  process.exit(1);
}

const byId = new Map(TENANTS_SEED.map((tenant) => [tenant.id, tenant]));
const byName = new Map(TENANTS_SEED.map((tenant) => [String(tenant.name).toLowerCase(), tenant]));
let patched = 0;
const tenants = Array.isArray(payload.tenants) ? payload.tenants : [];
payload.tenants = tenants.map((tenant) => {
  if (tenant.email) return tenant;
  const seed = byId.get(tenant.id) || byName.get(String(tenant.name).toLowerCase());
  if (!seed?.email) return tenant;
  patched += 1;
  return { ...tenant, email: seed.email };
});

await runAsSuperAdmin((tx) => [
  tx`
    update public.app_state set payload = ${JSON.stringify(payload)}::jsonb, updated_at = now()
    where id = 'main'
  `,
  ...buildSyncQueries(tx, payload),
]);

console.log(`Backfill listo: ${patched} negocio(s) con correo añadido.`);
console.log("Las tablas operativas y los accesos owner ya están sincronizados.");
