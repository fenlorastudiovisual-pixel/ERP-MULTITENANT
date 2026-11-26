// Verificación del token que Cloudflare Access añade a cada petición autenticada.
// Solo para servidor (rutas /api/*). Las credenciales se leen de variables de entorno.

import { createRemoteJWKSet, jwtVerify } from "jose";

export const CF_ACCESS_TEAM_DOMAIN = (process.env.CF_ACCESS_TEAM_DOMAIN || "").replace(/\/+$/, "");
const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD || "";

export const accessEnabled = Boolean(CF_ACCESS_TEAM_DOMAIN && CF_ACCESS_AUD);

let jwks = null;

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
  }
  return jwks;
}

/**
 * Devuelve el correo verificado por Cloudflare Access, o null si la petición
 * no viene de una sesión válida de Access.
 */
export async function getAccessEmail(request) {
  if (!accessEnabled) return null;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: CF_ACCESS_TEAM_DOMAIN,
      audience: CF_ACCESS_AUD,
      algorithms: ["RS256"],
    });
    return typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}
