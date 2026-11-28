// Aplica database/seed-ultra-config.sql SOLO con confirmación explícita.
// El seed es idempotente: solo INSERT ... ON CONFLICT DO NOTHING.
// Usa DATABASE_URL (conexión administrativa) y nunca imprime secretos.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { splitStatements } from "./split-sql.mjs";

const confirmation = process.argv.find((arg) => arg.startsWith("--confirm="));
if (confirmation !== "--confirm=ULTRA-SEED") {
  console.error("Confirmación requerida: node database/apply-ultra-seed.mjs --confirm=ULTRA-SEED");
  process.exit(2);
}

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("DATABASE_URL no configurada. Usa la conexión administrativa, no DATABASE_APP_URL.");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const statements = splitStatements(await readFile(path.join(here, "seed-ultra-config.sql"), "utf8"));
if (!statements.length) {
  console.error("El seed no contiene sentencias ejecutables.");
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
      console.error(`No se pudo aplicar el seed (sentencia ${index + 1}/${statements.length}):`, error?.message || String(error));
      await client.query("rollback");
      process.exit(1);
    }
  }
  await client.query("commit");
  const { rows } = await client.query(`
    select
      (select count(*)::int from public.erp_entities) as entities,
      (select count(*)::int from public.erp_ledgers) as ledgers,
      (select count(*)::int from public.erp_posting_rules) as rules,
      (select count(*)::int from public.erp_consolidation_groups) as groups,
      (select count(*)::int from public.erp_consolidation_members) as members
  `);
  console.log("Seed aplicado:", JSON.stringify(rows[0]));
} catch (error) {
  console.error("No se pudo conectar para aplicar el seed:", error?.message || String(error));
  process.exit(1);
} finally {
  await client.end();
}
