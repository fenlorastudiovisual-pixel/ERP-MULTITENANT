import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Configuración mínima: cachés en memoria, sin R2/D1/KV obligatorios.
// Las variables sensibles se inyectan como secrets de Cloudflare en runtime.
export default defineCloudflareConfig();
