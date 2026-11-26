// Verificación puntual de la vinculación automática del propietario.
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* sin .env.local */ }
}
loadEnv();

const { runAsSuperAdmin } = await import("../lib/db.js");
const rows = await runAsSuperAdmin((tx) => [
  tx`select source_key, name, settings->>'email' as email from public.tenants where source_key = 't16'`,
  tx`
    select tm.role, tm.active, p.email, p.global_role
    from public.tenant_members tm
    join public.profiles p on p.id = tm.user_id
    join public.tenants t on t.id = tm.tenant_id
    where t.source_key = 't16'
  `,
  tx`select payload from public.app_state where id = 'main'`,
]);

const tenant = rows[0][0];
const members = rows[1];
const stateTenant = rows[2][0]?.payload?.tenants?.find((item) => item.id === "t16");

console.log(`tenant: ${tenant?.name} · settings.email=${tenant?.email}`);
console.log(`app_state.email: ${stateTenant?.email || "(vacío)"}`);
console.log(`miembros: ${JSON.stringify(members)}`);

const ok = tenant?.email === "fenlorastudiovisual@gmail.com"
  && stateTenant?.email === "fenlorastudiovisual@gmail.com"
  && members.some((m) => m.role === "owner" && m.active && m.email === "fenlorastudiovisual@gmail.com");
console.log(ok ? "OK: propietario vinculado automáticamente" : "ERROR: falta la vinculación");
process.exitCode = ok ? 0 : 1;
