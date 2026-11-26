// Prueba integral del alta automática: crear negocio con correo -> owner vinculado.
// Usa un negocio temporal y lo elimina al final. No deja datos en Neon.
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* sin .env.local */ }
}
loadEnv();

const { runAsSuperAdmin } = await import("../lib/db.js");
const { buildSyncQueries, uuidFor } = await import("../lib/state-sync.js");
const { resolveTenantIdentity } = await import("../lib/tenant-identity.js");

const EMAIL = "sync-test@fenloravisual.com";
const KEY = "t99";

async function save(payload) {
  await runAsSuperAdmin((tx) => [
    tx`update public.app_state set payload = ${JSON.stringify(payload)}::jsonb, updated_at = now() where id = 'main'`,
    ...buildSyncQueries(tx, payload),
  ]);
}

const original = (await runAsSuperAdmin((tx) => tx`select payload from public.app_state where id = 'main'`))[0].payload;

try {
  const testTenant = {
    id: KEY, name: "Negocio prueba automática", email: EMAIL, niche: "Retail",
    plan: "inicio", country: "Colombia", city: "Bogotá", users: 1, status: "Prueba",
    mode: "Pool", mrr: 0, health: 60, color: "#6366f1", created: "2026-11-26",
  };
  await save({ ...original, tenants: [testTenant, ...original.tenants] });

  const identity = await resolveTenantIdentity(EMAIL);
  const member = await runAsSuperAdmin((tx) => tx`
    select tm.role, tm.active, p.email, p.source_key
    from public.tenant_members tm
    join public.profiles p on p.id = tm.user_id
    where tm.tenant_id = ${uuidFor(`tenant:${KEY}`)}::uuid
  `);

  const ok = identity?.tenant_key === KEY && identity?.role === "owner"
    && member.some((m) => m.role === "owner" && m.active && m.email === EMAIL);
  console.log(`identidad resuelta: ${identity?.tenant_key} · rol=${identity?.role}`);
  console.log(`miembro en BD: ${JSON.stringify(member)}`);
  console.log(ok ? "OK: el correo queda vinculado al crear el negocio" : "ERROR: no se vinculó automáticamente");
  if (!ok) process.exitCode = 1;
} finally {
  // Restaurar el estado original y borrar toda huella del negocio de prueba.
  // auth.users no permite DELETE al rol de la app: se limpia con el rol admin.
  await save(original);
  const { neon } = await import("@neondatabase/serverless");
  const admin = neon(process.env.DATABASE_URL);
  await admin`delete from auth.users where lower(email) = lower(${EMAIL})`;
  await admin`delete from public.tenants where source_key = ${KEY}`;
  console.log("Limpieza completada.");
}
