// Da acceso de dueño a un correo sobre un tenant existente (por defecto el sandbox).
// La contraseña se Hashea con PBKDF2 y NUNCA se imprime ni se guarda en texto plano.
// Uso:
//   TENANT_OWNER_EMAIL=correo TENANT_OWNER_PASSWORD=clave npm run db:add-owner
//   TENANT_OWNER_EMAIL=correo TENANT_OWNER_PASSWORD=clave TENANT_OWNER_KEY=t17_sandbox npm run db:add-owner

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { hashPassword } from "../lib/auth.js";
import { uuidFor } from "../lib/state-sync.js";

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // Sin .env.local se usa DATABASE_URL del entorno.
  }
}

loadEnv();

const email = String(process.env.TENANT_OWNER_EMAIL || "").trim().toLowerCase();
const password = String(process.env.TENANT_OWNER_PASSWORD || "");
const tenantKey = String(process.env.TENANT_OWNER_KEY || "t17_sandbox").trim();
const fullName = String(process.env.TENANT_OWNER_NAME || "Owner").trim();

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("TENANT_OWNER_EMAIL no válido.");
  process.exit(1);
}
if (password.length < 12 || password.length > 200) {
  console.error("TENANT_OWNER_PASSWORD debe tener entre 12 y 200 caracteres.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const tenants = await sql`
  select id::text, name, source_key from public.tenants where source_key = ${tenantKey}
`;
if (!tenants.length) {
  console.error(`No existe el tenant con source_key ${tenantKey}.`);
  process.exit(1);
}
const tenant = tenants[0];

const passwordHash = await hashPassword(password);
const userId = uuidFor(`user:${email}`);

await sql.transaction((tx) => [
  tx`select set_config('app.user_role', 'super_admin', true)`,
  tx`
    with u as (
      insert into auth.users (id, email, password_hash, active, failed_attempts, locked_until)
      values (${userId}::uuid, ${email}, ${passwordHash}, true, 0, null)
      on conflict (email) do update set
        password_hash = excluded.password_hash,
        active = true,
        failed_attempts = 0,
        locked_until = null
      returning id
    )
    insert into public.profiles (id, source_key, full_name, email, global_role, mfa_enabled)
    select u.id, 'owner:' || ${email}, ${fullName}, ${email}, null, false from u
    on conflict (id) do update set
      email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name)
  `,
  tx`
    insert into public.tenant_members (tenant_id, user_id, role, active)
    select ${tenant.id}::uuid, ${userId}::uuid, 'owner', true
    on conflict (tenant_id, user_id) do update set role = 'owner', active = true
  `,
]);

console.log(JSON.stringify({ ok: true, email, tenant: tenant.name, tenantKey: tenant.source_key, role: "owner" }));
