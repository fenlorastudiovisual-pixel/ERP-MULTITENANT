// Compila el Worker de Cloudflare sin hornear secretos en el bundle.
//
// OpenNext genera `.open-next/cloudflare/next-env.mjs` leyendo los .env*.
// Durante el build ocultamos todos los archivos .env reales; las variables
// sensibles se inyectan en producción como secrets de Cloudflare y se leen
// desde process.env en runtime (lib/db.js y lib/auth.js).

import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import "./patch-opennext-windows.mjs";

const root = process.cwd();
const envFiles = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.test",
  ".env.production.local",
  ".env.development.local",
  ".env.test.local",
];

const hidden = [];
for (const name of envFiles) {
  const path = join(root, name);
  const hiddenPath = join(root, `${name}.__build_hidden__`);
  if (!existsSync(path)) continue;
  if (existsSync(hiddenPath)) {
    console.error(`Existe un respaldo pendiente: ${hiddenPath}. Restáuralo antes de compilar.`);
    process.exit(1);
  }
  renameSync(path, hiddenPath);
  hidden.push([path, hiddenPath]);
}

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
  for (const [path, hiddenPath] of hidden) {
    if (existsSync(hiddenPath)) renameSync(hiddenPath, path);
  }
}
