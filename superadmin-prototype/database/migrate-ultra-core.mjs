// Aplica database/ultra-erp-core.sql SOLO con confirmación explícita.
// No se ejecuta desde npm scripts ni en despliegues. Nunca imprime secretos.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const confirmation = process.argv.find((arg) => arg.startsWith("--confirm="));
if (confirmation !== "--confirm=ULTRA-CORE") {
  console.error("Confirmación requerida: node database/migrate-ultra-core.mjs --confirm=ULTRA-CORE");
  process.exit(2);
}

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("DATABASE_URL no configurada. Usa la conexión administrativa, no DATABASE_APP_URL.");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(here, "ultra-erp-core.sql");
const statement = await readFile(sqlPath, "utf8");

const sql = neon(adminUrl);
try {
  await sql.unsafe(statement);
  console.log("Ultra ERP core aplicado: tablas, índices, triggers y RLS creados de forma aditiva.");
} catch (error) {
  console.error("No se pudo aplicar Ultra ERP core:", error?.message || String(error));
  process.exit(1);
}
