// Crea el rol que usa la app en producción: LOGIN sin BYPASSRLS.
// La URL de administrador (DATABASE_URL) se reserva para migraciones y scripts.
// Uso: node database/setup-app-role.mjs
// Opciones por entorno: ERP_APP_ROLE, ERP_APP_PASSWORD, ERP_APP_URL_FILE.

import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
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

function upsertEnvLine(file, key, value) {
  let text = "";
  try { text = readFileSync(file, "utf8"); } catch { /* archivo nuevo */ }
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
  writeFileSync(file, next, "utf8");
}

loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL (cadena administrativa) en .env.local.");
  process.exit(1);
}

const role = process.env.ERP_APP_ROLE || "erp_app";
const password = process.env.ERP_APP_PASSWORD || randomBytes(24).toString("hex");
const adminUrl = new URL(process.env.DATABASE_URL);
const sql = neon(process.env.DATABASE_URL);

const exists = await sql`select 1 from pg_roles where rolname = ${role}`;
if (exists.length) {
  await sql.query(`alter role ${role} with login password '${password}' nobypassrls nocreatedb nocreaterole`);
} else {
  await sql.query(`create role ${role} with login password '${password}' nobypassrls nocreatedb nocreaterole`);
}

await sql.query(`grant usage on schema public, auth to ${role}`);
await sql.query(`grant select, insert, update, delete on all tables in schema public to ${role}`);
await sql.query(`grant select, insert, update on auth.users to ${role}`);
await sql.query(`grant usage on all sequences in schema public to ${role}`);
await sql.query(`grant execute on all functions in schema public to ${role}`);
await sql.query(`alter default privileges in schema public grant select, insert, update, delete on tables to ${role}`);

const appUrl = new URL(adminUrl.toString());
appUrl.username = role;
appUrl.password = password;

if (process.env.ERP_APP_URL_FILE) {
  writeFileSync(process.env.ERP_APP_URL_FILE, appUrl.toString(), "utf8");
}
upsertEnvLine(new URL("../.env.local", import.meta.url), "DATABASE_APP_URL", appUrl.toString());
upsertEnvLine(new URL("../.dev.vars", import.meta.url), "DATABASE_APP_URL", appUrl.toString());

console.log(`Rol ${role} listo: LOGIN, sin BYPASSRLS, con permisos en public y auth.`);
console.log("DATABASE_APP_URL actualizada en .env.local y .dev.vars (no se versionan).");
