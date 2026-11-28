// Agrega brand a products/items y normaliza los nombres y SKUs importados
// desde Samjuro. Solo escribe en el piloto t17_sandbox de Neon; nunca toca
// la Supabase de Samjuro ni el tenant real t16.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { buildCatalogRows } from "./samjuro-catalog-utils.mjs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = envText.match(/^DATABASE_URL=(.*)$/m)?.[1].replace(/^["']|["']$/g, "");
if (!url) throw new Error("DATABASE_URL no encontrada en .env.local");
const sql = neon(url);

await sql.query("alter table public.products add column if not exists brand text");
await sql.query("alter table public.items add column if not exists brand text");
await sql.query("update public.products set brand = 'General' where brand is null");
await sql.query("update public.items set brand = 'General' where brand is null");
await sql.query("alter table public.products alter column brand set not null");
await sql.query("alter table public.items alter column brand set not null");
await sql.query("alter table public.products alter column brand set default 'General'");
await sql.query("alter table public.items alter column brand set default 'General'");

const [tenant] = await sql`select id::text as id from public.tenants where source_key = 't17_sandbox'`;
if (!tenant) throw new Error("No existe el tenant piloto t17_sandbox");
const T = tenant.id;

const staged = await sql`
  select name, payload from samjuro_stage.raw_tables
  where name in ('productos', 'presentaciones', 'marcas', 'categorias')
`;
const byName = new Map(staged.map((row) => [row.name, row.payload]));
const rows = buildCatalogRows({
  productos: byName.get("productos") || [],
  presentaciones: byName.get("presentaciones") || [],
  marcas: byName.get("marcas") || [],
  categorias: byName.get("categorias") || [],
  tenantId: T,
});
if (!rows.length) throw new Error("No hay filas de catálogo en el staging");

const ids = rows.map((r) => r.id);
const skus = rows.map((r) => r.sku);
const names = rows.map((r) => r.name);
const brands = rows.map((r) => r.brand);
const categories = rows.map((r) => r.category);

for (const update of [
  sql`
    with input as (
      select * from unnest(
        ${ids}::uuid[], ${skus}::text[], ${names}::text[],
        ${brands}::text[], ${categories}::text[]
      ) as t(id, sku, name, brand, category)
    )
    update public.products p
    set sku = i.sku, name = i.name, brand = i.brand,
        category = i.category, updated_at = now()
    from input i
    where p.tenant_id = ${T}::uuid and p.id = i.id
  `,
  sql`
    with input as (
      select * from unnest(
        ${ids}::uuid[], ${skus}::text[], ${names}::text[],
        ${brands}::text[], ${categories}::text[]
      ) as t(id, sku, name, brand, category)
    )
    update public.items p
    set sku = i.sku, name = i.name, brand = i.brand,
        category = i.category, updated_at = now()
    from input i
    where p.tenant_id = ${T}::uuid and p.id = i.id
  `,
]) {
  await update;
}

await sql`
  with input as (
    select * from unnest(
      ${ids}::uuid[],
      ${rows.map((r) => r.sourceSku || r.sku)}::text[]
    ) as t(item_id, source_sku)
  )
  update public.samjuro_item_map m
  set source_sku = i.source_sku
  from input i
  where m.tenant_id = ${T}::uuid and m.item_id = i.item_id
`;

await sql`
  with input as (
    select * from unnest(${ids}::uuid[], ${skus}::text[]) as t(item_id, sku)
  )
  update public.samjuro_price_sync s
  set sku = i.sku
  from input i
  where s.tenant_id = ${T}::uuid and s.item_id = i.item_id
`;

const check = await sql`
  select count(*)::int as total,
         count(*) filter (where brand <> 'General')::int as with_brand,
         count(*) filter (where name like '%#35 #35%')::int as bad_names,
         count(*) filter (where sku like 'SAM-233-%' and sku <> 'SAM-233-35')::int as old_sample_skus
  from public.products where tenant_id = ${T}::uuid
`;
console.log(`Filas normalizadas: ${check[0].total} · con marca: ${check[0].with_brand}`);
console.log(`Nombres duplicados: ${check[0].bad_names} · SKUs antiguos de muestra: ${check[0].old_sample_skus}`);
