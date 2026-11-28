// Aplica database/ultra-erp-core.sql SOLO con confirmación explícita.
// No se ejecuta desde npm scripts ni en despliegues. Nunca imprime secretos.
// Usa el protocolo Postgres completo (pg), no el endpoint HTTP de Neon:
// este último no persiste DDL. Las sentencias se separan respetando comillas,
// comentarios y bloques $$, y se ejecutan en una sola transacción.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { splitStatements } from "./split-sql.mjs";

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
const statements = splitStatements(await readFile(path.join(here, "ultra-erp-core.sql"), "utf8"));
if (!statements.length) {
  console.error("El archivo SQL no contiene sentencias ejecutables.");
  process.exit(2);
}

const client = new pg.Client({ connectionString: adminUrl });
try {
  await client.connect();
  await client.query("begin");
  for (const [index, statement] of statements.entries()) {
    try {
      await client.query(statement);
    } catch (error) {
      console.error(`No se pudo aplicar Ultra ERP core (sentencia ${index + 1}/${statements.length}):`, error?.message || String(error));
      await client.query("rollback");
      process.exit(1);
    }
  }
  await client.query("commit");
  console.log(`Ultra ERP core aplicado: ${statements.length} sentencias en una sola transacción.`);
} catch (error) {
  console.error("No se pudo conectar para aplicar Ultra ERP core:", error?.message || String(error));
  process.exit(1);
} finally {
  await client.end();
}
