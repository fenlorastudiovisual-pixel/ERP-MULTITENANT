// Corrige solo la etiqueta visible del tenant sandbox en Neon.
// No toca t16, la Supabase de Samjuro ni ninguna credencial.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = envText.match(/^DATABASE_URL=(.*)$/m)?.[1].replace(/^["']|["']$/g, "");
if (!url) throw new Error("DATABASE_URL no encontrada en .env.local");
const sql = neon(url);

const rows = await sql`
  update public.tenants
  set name = 'Samjuro',
      niche = null,
      city = null,
      updated_at = now()
  where source_key = 't17_sandbox'
  returning id::text as id, source_key, name, niche, city
`;

console.log(`Tenants actualizados: ${rows.length}`);
for (const row of rows) {
  console.log(`${row.source_key} → ${row.name} | ciudad=${row.city ?? "(sin ciudad)"} | nicho=${row.niche ?? "(sin nicho)"}`);
}
