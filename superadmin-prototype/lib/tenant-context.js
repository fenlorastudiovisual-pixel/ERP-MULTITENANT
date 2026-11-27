// Contexto del panel del negocio, reutilizable por todas las rutas /negocio/api/*.
// La identidad NUNCA se toma de la URL: viene de la sesión con contraseña y,
// como respaldo, del correo verificado por Cloudflare Access. Después de resolver
// la identidad, cada consulta se ejecuta con runAsTenant(identity.tenant_id, ...).

import { getTenantAccessEmail } from "./access.js";
import { findUserByEmail, getTenantSession } from "./auth.js";
import { resolveTenantIdentity } from "./tenant-identity.js";

const fail = (status, message, extra = {}) => ({ error: { status, message, ...extra } });

export async function resolveBusinessContext(request) {
  let email = null;
  let authMode = "access";

  const session = await getTenantSession(request);
  if (session) {
    try {
      const user = await findUserByEmail(session.email);
      if (user && user.id === session.sub && user.epoch === session.epoch) {
        email = user.email;
        authMode = "password";
      }
    } catch {
      email = null;
    }
  }

  if (!email) email = await getTenantAccessEmail(request);
  if (!email && process.env.NODE_ENV !== "production") {
    email = (request.headers.get("x-dev-email") || "").toLowerCase() || null;
    if (email) authMode = "dev";
  }

  if (!email) {
    return fail(401, "Inicia sesión con tu correo y contraseña para entrar al negocio.", { needsLogin: true });
  }

  let identity = null;
  try {
    identity = await resolveTenantIdentity(email);
  } catch (error) {
    return fail(500, error?.message || String(error));
  }
  if (!identity) {
    return fail(403, "Tu correo no está vinculado a ningún negocio. Pide al administrador que te invite.", { email });
  }

  return {
    email,
    identity,
    authMode,
    role: identity.role === "owner" ? "tenant_owner" : "tenant_user",
  };
}
