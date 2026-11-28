// Aplica database/samjuro-price-sync.sql y reconstruye el mapa ítem ERP -> fila de Samjuro.
// No escribe en la Supabase de Samjuro; solo en la base del ERP.
// Uso: npm run db:samjuro-sync

import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // Sin .env.local: se usa DATABASE_URL del entorno.
  }
}

function splitSql(text) {
  const statements = [];
  let current = "";
  let inDollar = false;
  let inSingle = false;
  let inLineComment = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inDollar) {
      if (text.startsWith("$$", i)) { inDollar = false; current += "$$"; i += 1; }
      else current += ch;
      continue;
    }
    if (inSingle) {
      if (ch === "'" && text[i + 1] === "'") { current += "''"; i += 1; }
      else if (ch === "'") { current += ch; inSingle = false; }
      else current += ch;
      continue;
    }
    if (text.startsWith("--", i)) { inLineComment = true; current += "--"; i += 1; }
    else if (text.startsWith("$$", i)) { inDollar = true; current += "$$"; i += 1; }
    else if (ch === "'") { inSingle = true; current += ch; }
    else if (ch === ";") { if (current.trim()) statements.push(current.trim()); current = ""; }
    else current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const uuid = (value) => {
  const h = crypto.createHash("md5").update(String(value)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const text = (value) => (value == null ? "" : String(value));

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const statements = splitSql(readFileSync(new URL("./samjuro-price-sync.sql", import.meta.url), "utf8"));
for (const statement of statements) await sql.query(statement);

const [tenant] = await sql`
  select id::text as id from public.tenants where source_key = 't17_sandbox'
`;
if (!tenant) throw new Error("No existe el tenant piloto t17_sandbox");
const T = tenant.id;
console.log(`Aplicando ${statements.length} sentencias y reconstruyendo el mapa del piloto...`);

const staged = await sql`
  select name, payload from samjuro_stage.raw_tables
  where name in ('productos', 'presentaciones')
`;
const byName = new Map(staged.map((row) => [row.name, row.payload]));
const productos = byName.get("productos") || [];
const presentaciones = byName.get("presentaciones") || [];
if (!productos.length || !presentaciones.length) throw new Error("Falta el staging de productos/presentaciones");

const productsById = new Map(productos.map((p) => [String(p.id), p]));
const rows = [];
for (const p of productos) {
  rows.push({
    itemId: uuid(`${p.id}:product:${T}`),
    sourceTable: "productos",
    sourceRowId: String(p.id),
    sourceSku: text(p.sku) || null,
    columnName: "precio_referencia",
  });
}
for (const pr of presentaciones) {
  const parent = productsById.get(String(pr.producto_id));
  const sku = text(pr.sku) || `${text(parent?.sku || "PROD")}-${String(pr.id).slice(0, 8)}`;
  rows.push({
    itemId: uuid(`${pr.id}:presentation:${T}`),
    sourceTable: "presentaciones",
    sourceRowId: String(pr.id),
    sourceSku: sku,
    columnName: "precio",
  });
}

await sql.transaction((tx) => {
  const queries = [];
  for (let i = 0; i < rows.length; i += 250) {
    const chunk = rows.slice(i, i + 250);
    queries.push(tx`
      insert into public.samjuro_item_map
        (tenant_id, item_id, source_table, source_row_id, source_sku, column_name)
      select * from unnest(
        ${chunk.map(() => T)}::uuid[],
        ${chunk.map((r) => r.itemId)}::uuid[],
        ${chunk.map((r) => r.sourceTable)}::text[],
        ${chunk.map((r) => r.sourceRowId)}::uuid[],
        ${chunk.map((r) => r.sourceSku)}::text[],
        ${chunk.map((r) => r.columnName)}::text[]
      ) as t(tenant_id, item_id, source_table, source_row_id, source_sku, column_name)
      on conflict (tenant_id, item_id) do update set
        source_table = excluded.source_table,
        source_row_id = excluded.source_row_id,
        source_sku = excluded.source_sku,
        column_name = excluded.column_name
    `);
  }
  return queries;
});

const check = await sql`
  select source_table, count(*)::int as total
  from public.samjuro_item_map where tenant_id = ${T}::uuid
  group by source_table order by source_table
`;
console.log("Mapa reconstruido:", JSON.stringify(check));
