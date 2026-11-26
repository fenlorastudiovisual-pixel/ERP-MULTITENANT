// TOTP (RFC 6238) con WebCrypto: funciona igual en Node y en Cloudflare Workers.
// Sin dependencias externas. Códigos de 6 dígitos, SHA-1, 30 s de periodo.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const clean = String(input || "").toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export function generateTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function totpUri(secret, email, issuer = "ERP Multitenant") {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha1(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}

export async function totpCode(secret, now = Date.now(), step = null) {
  const key = base32Decode(secret);
  if (!key.length) return null;
  const period = 30;
  const counter = new Uint8Array(8);
  let value = BigInt(step === null ? Math.floor(now / 1000 / period) : step);
  for (let i = 7; i >= 0; i--) {
    counter[i] = Number(value & 255n);
    value >>= 8n;
  }
  const hash = await hmacSha1(key, counter);
  const position = hash[hash.length - 1] & 15;
  const binary = ((hash[position] & 127) << 24)
    | (hash[position + 1] << 16)
    | (hash[position + 2] << 8)
    | hash[position + 3];
  return String(binary % 1000000).padStart(6, "0");
}

export async function verifyTotp(secret, code, now = Date.now(), window = 1) {
  const digits = String(code || "").replace(/\D/g, "");
  if (digits.length !== 6) return false;
  const period = 30;
  const step = Math.floor(now / 1000 / period);
  const encoder = new TextEncoder();

  for (let offset = -window; offset <= window; offset++) {
    const expected = await totpCode(secret, now, step + offset);
    if (expected && constantTimeEqual(encoder.encode(digits), encoder.encode(expected))) return true;
  }
  return false;
}
