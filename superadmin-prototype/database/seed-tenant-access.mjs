// Vincula un correo con un negocio para que pueda entrar a /negocio.
// Idempotente. Uso: npm run db:tenant-access
// Opciones: TENANT_ACCESS_EMAIL=correo TENANT_KEY=t16 node database/seed-tenant-access.mjs

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

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local.");
  process.exit(1);
}

const { runAsSuperAdmin } = await import("../lib/db.js");

const email = (process.env.TENANT_ACCESS_EMAIL || "fenlorastudiovisual@gmail.com").trim().toLowerCase();
const key = (process.env.TENANT_KEY || "t16").trim();
const role = (process.env.TENANT_ACCESS_ROLE || "owner").trim();

const found = await runAsSuperAdmin((tx) => [
  tx`select id, name, source_key from public.tenants where source_key = ${key}`,
  tx`select id, email from auth.users where lower(email) = lower(${email})`,
]);

const tenant = found[0]?.[0];
const user = found[1]?.[0];
if (!tenant) {
  console.error(`No existe el negocio ${key}. Guarda los cambios en el ERP y vuelve a intentar.`);
  process.exit(1);
}
if (!user) {
  console.error(`No existe el usuario ${email} en auth.users.`);
  process.exit(1);
}

await runAsSuperAdmin((tx) => [
  tx`
    insert into public.profiles (id, email, full_name, global_role)
    values (${user.id}::uuid, ${user.email}, 'Acceso al negocio', null)
    on conflict (id) do update set email = excluded.email
  `,
  tx`
    insert into public.tenant_members (tenant_id, user_id, role, active)
    values (${tenant.id}::uuid, ${user.id}::uuid, ${role}, true)
    on conflict (tenant_id, user_id) do update set role = excluded.role, active = true
  `,
]);

console.log(`Acceso listo: ${email} -> ${tenant.name} (${key}) como ${role}.`);
console.log("Ahora esa persona puede entrar con su One-time PIN a /negocio.");
