// Verificación del token que Cloudflare Access añade a cada petición autenticada.
// Solo para servidor (rutas /api/*). Las credenciales se leen de variables de entorno.
//
// Hay dos aplicaciones Access distintas sobre el mismo dominio:
//   - CF_ACCESS_AUD        -> consola del Super Admin (todo el sitio)
//   - CF_ACCESS_TENANT_AUD -> panel del negocio (/negocio*), regla más específica
// Un token de una aplicación NO sirve para la otra.

import { createRemoteJWKSet, jwtVerify } from "jose";

export const CF_ACCESS_TEAM_DOMAIN = (process.env.CF_ACCESS_TEAM_DOMAIN || "").replace(/\/+$/, "");
const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD || "";
const CF_ACCESS_TENANT_AUD = process.env.CF_ACCESS_TENANT_AUD || "";

export const accessEnabled = Boolean(CF_ACCESS_TEAM_DOMAIN && CF_ACCESS_AUD);
export const tenantAccessEnabled = Boolean(CF_ACCESS_TEAM_DOMAIN && CF_ACCESS_TENANT_AUD);

let jwks = null;

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
  }
  return jwks;
}

async function emailFromRequest(request, audience) {
  if (!audience) return null;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: CF_ACCESS_TEAM_DOMAIN,
      audience,
      algorithms: ["RS256"],
    });
    return typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Correo verificado por la aplicación Access del Super Admin. */
export async function getAccessEmail(request) {
  return emailFromRequest(request, CF_ACCESS_AUD);
}

/** Correo verificado por la aplicación Access del panel del negocio. */
export async function getTenantAccessEmail(request) {
  return emailFromRequest(request, CF_ACCESS_TENANT_AUD);
}

/** URL para cerrar la sesión de Access y volver al panel del negocio. */
export function tenantLogoutUrl(origin) {
  const target = `${origin}/negocio`;
  return `${CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout?returnTo=${encodeURIComponent(target)}`;
}
