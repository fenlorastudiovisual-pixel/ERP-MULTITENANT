// Traslada el estado actual de public.app_state a las tablas operativas.
// Idempotente: usa los mismos UUID deterministas que /api/state.
// Uso: npm run db:migrate-state  (después de npm run db:setup)

import { readFileSync } from "node:fs";

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

loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local.");
  process.exit(1);
}

// Importación dinámica: lib/db.js lee DATABASE_URL al cargarse.
const { neon } = await import("@neondatabase/serverless");
const { runAsSuperAdmin } = await import("../lib/db.js");
const { buildSyncQueries } = await import("../lib/state-sync.js");

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`select payload from public.app_state where id = 'main'`;
const payload = rows[0]?.payload;

if (!payload || typeof payload !== "object") {
  console.error("No hay estado en public.app_state. Abre el ERP y guarda una vez antes de migrar.");
  process.exit(1);
}

console.log("Migrando estado a tablas operativas...");
const results = await runAsSuperAdmin((tx) => buildSyncQueries(tx, payload));
console.log(`OK. ${results.length} tablas sincronizadas.`);
console.log("Comprueba el resultado con: npm run db:inspect");
