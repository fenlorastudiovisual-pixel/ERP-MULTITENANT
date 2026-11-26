// Migración del acceso híbrido del panel del negocio.
// Añade el control de sesiones y la tabla de MFA opcional. Idempotente.
// Uso: npm run db:migrate-auth
// Usa DATABASE_URL (rol administrador): el rol de la app no puede alterar tablas.

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

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

await sql`alter table auth.users add column if not exists tenant_session_epoch uuid not null default gen_random_uuid()`;
await sql`
  create table if not exists public.tenant_mfa (
    user_id uuid primary key references auth.users(id) on delete cascade,
    secret text not null,
    enabled boolean not null default false,
    created_at timestamptz not null default now()
  )
`;
await sql`alter table public.tenant_mfa enable row level security`;
await sql`drop policy if exists superadmin_all on public.tenant_mfa`;
await sql`
  create policy superadmin_all on public.tenant_mfa for all to public
  using (public.is_superadmin()) with check (public.is_superadmin())
`;
await sql`alter table public.tenant_mfa force row level security`;

console.log("Migración lista: sesiones rotables y MFA opcional disponibles.");
