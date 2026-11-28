// Verificación rápida del catálogo normalizado del piloto.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = envText.match(/^DATABASE_URL=(.*)$/m)?.[1].replace(/^["']|["']$/g, "");
if (!url) throw new Error("DATABASE_URL no encontrada en .env.local");
const sql = neon(url);

const rows = await sql`
  select sku, name, brand, category
  from public.products
  where tenant_id = (select id from public.tenants where source_key = 't17_sandbox')
    and (sku = 'CH-ESM-208-P1' or sku = 'SAM-233' or sku = 'SAM-233-35')
  order by sku
`;
for (const row of rows) {
  console.log(`${row.sku} | ${row.name} | ${row.brand} | ${row.category}`);
}

const brands = await sql`
  select brand, count(*)::int as total
  from public.products
  where tenant_id = (select id from public.tenants where source_key = 't17_sandbox')
  group by brand order by total desc, brand
`;
console.log(`Marcas: ${brands.map((b) => `${b.brand}(${b.total})`).join(", ")}`);
