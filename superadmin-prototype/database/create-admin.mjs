// Crea o actualiza un Super Admin en Neon.
// Uso: ADMIN_EMAIL=correo ADMIN_PASSWORD=clave npm run db:admin
//      node database/create-admin.mjs correo clave
// La contraseña nunca se guarda en texto plano ni se imprime.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { hashPassword } from "../lib/auth.js";

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

const email = (process.env.ADMIN_EMAIL || process.argv[2] || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || process.argv[3] || "";

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("ADMIN_EMAIL no válido.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("ADMIN_PASSWORD debe tener al menos 12 caracteres.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const passwordHash = await hashPassword(password);

const results = await sql.transaction((tx) => [
  tx`insert into auth.users (email, password_hash, active, failed_attempts)
     values (${email}, ${passwordHash}, true, 0)
     on conflict (email) do update
       set password_hash = excluded.password_hash,
           active = true,
           failed_attempts = 0,
           locked_until = null
     returning id, email`,
]);

const user = results[0]?.[0];
if (!user) throw new Error("No se pudo crear el usuario");

await sql`
  insert into public.profiles (id, email, global_role)
  values (${user.id}::uuid, ${email}, 'super_admin')
  on conflict (id) do update
    set global_role = 'super_admin', email = excluded.email
`;

console.log(`Super Admin listo: ${user.email} (${user.id})`);
console.log("Ya puedes iniciar sesión en el panel.");
