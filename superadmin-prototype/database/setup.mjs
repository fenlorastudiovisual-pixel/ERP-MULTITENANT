// Aplica database/schema.sql a la BD indicada en .env.local (o DATABASE_URL).
// Uso: npm run db:setup

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      const value = match[2].replace(/^["']|["']$/g, "");
      process.env[match[1]] = value;
    }
  } catch {
    // Sin .env.local: se usa DATABASE_URL del entorno.
  }
}

// Separa por ';' respetando bloques $$ ... $$ y literales con comillas simples.
export function splitSql(text) {
  const statements = [];
  let current = "";
  let inDollar = false;
  let inSingle = false;
  let inLineComment = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inDollar) {
      if (text.startsWith("$$", i)) {
        inDollar = false;
        current += "$$";
        i++;
      } else current += ch;
      continue;
    }
    if (inSingle) {
      current += ch;
      if (ch === "'" && text[i + 1] === "'") {
        current += "'";
        i++;
      } else if (ch === "'") inSingle = false;
      continue;
    }
    if (text.startsWith("--", i)) {
      inLineComment = true;
      current += "--";
      i++;
    } else if (text.startsWith("$$", i)) {
      inDollar = true;
      current += "$$";
      i++;
    } else if (ch === "'") {
      inSingle = true;
      current += ch;
    } else if (ch === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

loadEnv();

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const statements = splitSql(schema);

if (process.argv.includes("--dry-run")) {
  console.log(`${statements.length} sentencias detectadas.`);
  console.log("Primera:", statements[0].slice(0, 90).replace(/\s+/g, " "));
  console.log("Última:", statements.at(-1).slice(0, 90).replace(/\s+/g, " "));
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL. Copia .env.example a .env.local y pega la connection string de Neon.");
  process.exit(1);
}

const sql = neon(url);

console.log(`Aplicando ${statements.length} sentencias a Neon...`);
for (const [index, statement] of statements.entries()) {
  try {
    await sql.query(statement);
  } catch (error) {
    console.error(`\nError en la sentencia ${index + 1}:\n${statement.slice(0, 240)}\n`);
    throw error;
  }
}

const [{ tables } = {}] = await sql`
  select count(*)::int as tables
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relrowsecurity and c.relforcerowsecurity
`;
console.log(`OK. Esquema aplicado. ${tables} tablas con RLS forzado.`);
