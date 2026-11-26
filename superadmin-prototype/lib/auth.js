// Autenticación del Super Admin: hashes PBKDF2 y sesiones firmadas con HMAC.
// Solo para servidor (rutas /api/*). Usa WebCrypto para funcionar igual en Node y Workers.

import { runAsSuperAdmin, dbEnabled } from "./db.js";
import { accessEnabled, getAccessEmail } from "./access.js";

const encoder = new TextEncoder();
export const SESSION_COOKIE = "erp_session";
export const TENANT_SESSION_COOKIE = "erp_tenant_session";
export const SESSION_MAX_AGE = 8 * 60 * 60; // 8 horas
const SESSION_VERSION = 1;
// Recomendación actual de OWASP para PBKDF2-HMAC-SHA256. Los hashes antiguos
// siguen verificándose; se actualizan solos cuando el usuario entra.
const PBKDF2_ITERATIONS = 600000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export function needsRehash(stored) {
  const iterations = Number(String(stored || "").split("$")[1]);
  return Boolean(iterations) && iterations < PBKDF2_ITERATIONS;
}

function toBase64Url(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(bits)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, iterations, salt, expected] = String(stored).split("$");
    if (scheme !== "pbkdf2" || !iterations || !salt || !expected) return false;
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: fromBase64Url(salt), iterations: Number(iterations), hash: "SHA-256" },
      key,
      256,
    );
    return constantTimeEqual(new Uint8Array(bits), fromBase64Url(expected));
  } catch {
    return false;
  }
}

// Deriva una clave de firma distinta de la clave usada como secreto general.
async function sessionKey() {
  const secret = process.env.SUPERADMIN_KEY;
  if (!secret) throw new Error("SUPERADMIN_KEY no configurada");
  const root = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const derived = await crypto.subtle.sign("HMAC", root, encoder.encode("erp-superadmin-session-v1"));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function createSession({ sub, email, role }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    v: SESSION_VERSION, sub, email, role, iat: now, exp: now + SESSION_MAX_AGE,
  })));
  const signature = toBase64Url(await crypto.subtle.sign("HMAC", await sessionKey(), encoder.encode(payload)));
  return `${payload}.${signature}`;
}

async function readSession(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = toBase64Url(await crypto.subtle.sign("HMAC", await sessionKey(), encoder.encode(payload)));
  if (!constantTimeEqual(encoder.encode(signature), encoder.encode(expected))) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (claims.v !== SESSION_VERSION || claims.role !== "super_admin") return null;
    if (!claims.sub || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function readCookies(request) {
  const header = request.headers.get("cookie") || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name && value) cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

function asAdminIdentity(user) {
  return user?.active && user.global_role === "super_admin"
    ? { id: user.id, email: user.email, role: "super_admin" }
    : null;
}

async function adminById(id) {
  const results = await runAsSuperAdmin((tx) => [
    tx`select u.id, u.email, u.active, p.global_role
       from auth.users u
       left join public.profiles p on p.id = u.id
       where u.id = ${String(id)}::uuid`,
  ]);
  return asAdminIdentity(results[0]);
}

async function adminByEmail(email) {
  const results = await runAsSuperAdmin((tx) => [
    tx`select u.id, u.email, u.active, p.global_role
       from auth.users u
       left join public.profiles p on p.id = u.id
       where lower(u.email) = ${String(email).toLowerCase()}`,
  ]);
  return asAdminIdentity(results[0]);
}

export async function getSessionUser(request) {
  if (!dbEnabled) return null;

  // Con Cloudflare Access activo, la identidad la aporta el token verificado.
  if (accessEnabled) {
    try {
      const email = await getAccessEmail(request);
      return email ? await adminByEmail(email) : null;
    } catch {
      return null;
    }
  }

  // Modo de respaldo sin Access: sesión firmada en cookie.
  const claims = await readSession(readCookies(request)[SESSION_COOKIE]);
  if (!claims) return null;
  try {
    return await adminById(claims.sub);
  } catch {
    return null;
  }
}

export async function findAdminByEmail(email) {
  const results = await runAsSuperAdmin((tx) => [
    tx`select u.id, u.email, u.password_hash, u.active, u.failed_attempts, u.locked_until, p.global_role
       from auth.users u
       left join public.profiles p on p.id = u.id
       where lower(u.email) = ${String(email).toLowerCase()}`,
  ]);
  return results[0] || null;
}

export async function registerFailedAttempt(userId, attempts, locked) {
  const lockedUntil = locked ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null;
  await runAsSuperAdmin((tx) => [
    tx`update auth.users
       set failed_attempts = ${locked ? 0 : attempts},
           locked_until = ${lockedUntil}::timestamptz
       where id = ${userId}::uuid`,
  ]);
}

export async function registerSuccessfulLogin(userId, upgradedHash = null) {
  await runAsSuperAdmin((tx) => [
    tx`update auth.users
       set failed_attempts = 0, locked_until = null, last_login_at = now(),
           password_hash = coalesce(${upgradedHash}::text, password_hash)
       where id = ${userId}::uuid`,
  ]);
}

export function isLocked(lockedUntil) {
  return Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now());
}

export function shouldLock(attempts) {
  return attempts >= MAX_FAILED_ATTEMPTS;
}

export function cookieOptions(request) {
  const secure = new URL(request.url).protocol === "https:";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

// ── Sesión del panel del negocio ──────────────────────────────────────────────
// Cookie y clave de firma DISTINTAS de las del Super Admin: un token de cliente
// nunca puede interpretarse como una sesión de plataforma.

async function tenantSessionKey() {
  const secret = process.env.SUPERADMIN_KEY;
  if (!secret) throw new Error("SUPERADMIN_KEY no configurada");
  const root = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const derived = await crypto.subtle.sign("HMAC", root, encoder.encode("erp-tenant-session-v1"));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function createTenantSession({ sub, email, tenantId, role, epoch }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    v: SESSION_VERSION, sub, email, tenant_id: tenantId, role, epoch,
    iat: now, exp: now + SESSION_MAX_AGE,
  })));
  const signature = toBase64Url(
    await crypto.subtle.sign("HMAC", await tenantSessionKey(), encoder.encode(payload)),
  );
  return `${payload}.${signature}`;
}

export async function readTenantSession(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = toBase64Url(
    await crypto.subtle.sign("HMAC", await tenantSessionKey(), encoder.encode(payload)),
  );
  if (!constantTimeEqual(encoder.encode(signature), encoder.encode(expected))) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (claims.v !== SESSION_VERSION || !String(claims.role || "").startsWith("tenant_")) return null;
    if (!claims.sub || !claims.tenant_id || !claims.epoch || !claims.exp) return null;
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function tenantCookieOptions(request) {
  const secure = new URL(request.url).protocol === "https:";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/negocio",
    maxAge: SESSION_MAX_AGE,
  };
}

export async function getTenantSession(request) {
  const token = readCookies(request)[TENANT_SESSION_COOKIE];
  if (!token) return null;
  try {
    return await readTenantSession(token);
  } catch {
    return null;
  }
}

/** Datos de autenticación de cualquier usuario, sin asumir que es Super Admin. */
export async function findUserByEmail(email) {
  const results = await runAsSuperAdmin((tx) => tx`
    select u.id::text, u.email, u.password_hash, u.active,
           u.failed_attempts, u.locked_until,
           u.tenant_session_epoch::text as epoch
    from auth.users u
    where lower(u.email) = lower(${String(email)})
  `);
  return results[0] || null;
}

export async function getTenantMfa(userId) {
  const results = await runAsSuperAdmin((tx) => tx`
    select secret, enabled from public.tenant_mfa where user_id = ${String(userId)}::uuid
  `);
  return results[0] || null;
}

/** Rota el epoch: invalida todas las sesiones abiertas de ese usuario. */
export async function rotateTenantSession(userId) {
  await runAsSuperAdmin((tx) => tx`
    update auth.users set tenant_session_epoch = gen_random_uuid()
    where id = ${String(userId)}::uuid
  `);
}
