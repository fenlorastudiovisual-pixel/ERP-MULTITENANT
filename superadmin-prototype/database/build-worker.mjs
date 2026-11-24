// Compila el Worker de Cloudflare sin hornear secretos en el bundle.
//
// OpenNext genera `.open-next/cloudflare/next-env.mjs` leyendo todos los .env*.
// Si .env.local contiene DATABASE_URL / SUPERADMIN_KEY, esos valores quedan
// dentro del Worker. Aquí ocultamos .env.local durante el build y dejamos solo
// NEXT_PUBLIC_SUPERADMIN_KEY (público por diseño) en .env.production.
// En producción, DATABASE_URL y SUPERADMIN_KEY se inyectan como secrets de Cloudflare.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const localPath = join(root, ".env.local");
const hiddenPath = join(root, ".env.local.__build_hidden__");
const prodPath = join(root, ".env.production");

const readKey = () => {
  if (!existsSync(localPath)) return "";
  const line = readFileSync(localPath, "utf8")
    .split(/\r?\n/)
    .find((l) => /^\s*NEXT_PUBLIC_SUPERADMIN_KEY\s*=/.test(l));
  return line ? line.replace(/^\s*NEXT_PUBLIC_SUPERADMIN_KEY\s*=\s*/, "").trim().replace(/^["']|["']$/g, "") : "";
};

const publicKey = readKey();
if (!publicKey) {
  console.error("Falta NEXT_PUBLIC_SUPERADMIN_KEY en .env.local. No se puede compilar el Worker.");
  process.exit(1);
}

const hadLocal = existsSync(localPath);
const hadProd = existsSync(prodPath);
const prodBackup = hadProd ? readFileSync(prodPath) : null;

writeFileSync(prodPath, `NEXT_PUBLIC_SUPERADMIN_KEY=${publicKey}\n`, "utf8");
if (hadLocal && existsSync(hiddenPath)) unlinkSync(hiddenPath);
if (hadLocal) renameSync(localPath, hiddenPath);

try {
  const isWindows = process.platform === "win32";
  const command = isWindows ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["opennextjs-cloudflare", "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXTJS_ENV: "production" },
    shell: isWindows,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (hadLocal && existsSync(hiddenPath)) renameSync(hiddenPath, localPath);
  if (hadProd && prodBackup) writeFileSync(prodPath, prodBackup, "utf8");
  else if (existsSync(prodPath)) unlinkSync(prodPath);
}
