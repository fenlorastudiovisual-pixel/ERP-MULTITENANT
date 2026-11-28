// OpenNext copia archivos traceados y, cuando Next genera symlinks en
// `.next/node_modules`, intenta recrearlos dentro de `.open-next`. En Windows
// eso requiere privilegios de symlink (EPERM) y además el target absoluto de
// Windows sería inválido en el Worker Linux. Este parche idempotente sustituye
// esa recreación por una copia real del directorio, manteniendo el bundle
// portable. No modifica código de la aplicación ni secretos.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const file = join(
  process.cwd(),
  "node_modules",
  "@opennextjs",
  "aws",
  "dist",
  "build",
  "copyTracedFiles.js",
);
const marker = "__SAMJURO_WIN_FALLBACK__";

if (!existsSync(file)) {
  console.log("OpenNext copyTracedFiles.js no encontrado; se omite el parche.");
} else {
  const source = readFileSync(file, "utf8");
  if (source.includes(marker)) {
    console.log("Parche Windows de OpenNext ya aplicado.");
  } else {
    const needle = "symlinkSync(symlink, to);";
    if (!source.includes(needle)) {
      console.error("No se encontró el punto de parche en copyTracedFiles.js.");
      process.exitCode = 1;
    } else {
      const replacement = `try {
                  symlinkSync(symlink, to);
                } catch (e) {
                  if (e.code !== "EEXIST") {
                    // ${marker}: en Windows no se pueden crear symlinks sin
                    // privilegios. Copiar el contenido real funciona en Linux.
                    const resolved = path.isAbsolute(symlink)
                      ? symlink
                      : path.resolve(path.dirname(from), symlink);
                    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) throw e;
                    cpSync(resolved, to, { recursive: true, force: true });
                  }
                }`;
      writeFileSync(file, source.replace(needle, replacement));
      console.log("Parche Windows de OpenNext aplicado.");
    }
  }
}
