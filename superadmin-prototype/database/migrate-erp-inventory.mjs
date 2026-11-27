// Aplica database/erp-inventory.sql (Fase 3) sin tocar datos existentes.
// Uso: npm run db:erp-inventory

import { readFileSync } from "node:fs";
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
      current += ch;
      if (ch === "'" && text[i + 1] === "'") { current += "'"; i += 1; }
      else if (ch === "'") inSingle = false;
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

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL. Copia .env.example a .env.local y pega la connection string de Neon.");
  process.exit(1);
}

const sql = neon(url);
const statements = splitSql(readFileSync(new URL("./erp-inventory.sql", import.meta.url), "utf8"));
console.log(`Aplicando ${statements.length} sentencias de inventario y compras...`);
for (const [index, statement] of statements.entries()) {
  try {
    await sql.query(statement);
  } catch (error) {
    console.error(`\nError en la sentencia ${index + 1}:\n${statement.slice(0, 260)}\n`);
    throw error;
  }
}

const [{ tables } = {}] = await sql`
  select count(*)::int as tables
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relrowsecurity and c.relforcerowsecurity
`;
console.log(`OK. Inventario y compras aplicados. ${tables} tablas con RLS forzado.`);
