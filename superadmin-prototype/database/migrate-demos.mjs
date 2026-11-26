// Migración del centro de demos reales: enlaces compartibles con datos operativos.
// Idempotente. Usa DATABASE_URL (rol administrador).
// Uso: npm run db:migrate-demos

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

await sql`
  create table if not exists public.demo_links (
    id uuid primary key default gen_random_uuid(),
    token text not null unique,
    niche_id text not null,
    business_name text not null,
    created_by text,
    expires_at timestamptz not null,
    visits integer not null default 0,
    status text not null default 'Activa',
    payload jsonb not null,
    lead jsonb,
    converted_tenant text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
`;
await sql`alter table public.demo_links enable row level security`;
await sql`drop policy if exists superadmin_all on public.demo_links`;
await sql`
  create policy superadmin_all on public.demo_links for all to public
  using (public.is_superadmin()) with check (public.is_superadmin())
`;
await sql`alter table public.demo_links force row level security`;
await sql`
  do $$
  begin
    if exists (select 1 from pg_roles where rolname = 'erp_app') then
      grant select, insert, update, delete on public.demo_links to erp_app;
    end if;
  end $$
`;

console.log("Migración lista: tabla public.demo_links preparada.");
