// Verifica la conexión a Neon y el contexto RLS.
// Uso: npm run db:check

import { readFileSync } from "node:fs";

try {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // Sin .env.local.
}

const { dbHealth, runAsSuperAdmin, runAsTenant, dbEnabled } = await import("../lib/db.js");

const health = await dbHealth();
console.log("Conexión:", JSON.stringify(health, null, 2));

if (!dbEnabled || !health.ok) process.exit(1);

const admin = await runAsSuperAdmin((tx) => tx`select public.is_superadmin() as admin, public.current_tenant_id() as tenant`);
console.log("Contexto super admin:", admin[0]);

const tenant = await runAsTenant("11111111-1111-1111-1111-111111111111", (tx) => tx`
  select public.is_superadmin() as admin, public.current_tenant_id() as tenant
`);
console.log("Contexto tenant:", tenant[0]);
