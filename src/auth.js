/**
 * Authentication & Security Module
 * จัดการการเข้ารหัสรหัสผ่าน (PBKDF2 SHA-256 + Salt) และ Session Cookie
 */

const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 วัน

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

function timingSafeEqual(strA, strB) {
  if (typeof strA !== "string" || typeof strB !== "string") return false;
  if (strA.length !== strB.length) return false;
  let mismatch = 0;
  for (let i = 0; i < strA.length; i++) {
    mismatch |= strA.charCodeAt(i) ^ strB.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function hashPassword(password) {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const saltHex = bufferToHex(saltBytes);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  const hashHex = bufferToHex(derivedBits);
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password, storedPasswordHash) {
  if (!storedPasswordHash || typeof storedPasswordHash !== "string") return false;
  const parts = storedPasswordHash.split(":");
  if (parts.length !== 2) return false;

  const [saltHex, originalHashHex] = parts;
  const saltBytes = hexToBuffer(saltHex);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  const testHashHex = bufferToHex(derivedBits);
  return timingSafeEqual(testHashHex, originalHashHex);
}

export function parseCookies(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = {};
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const name = parts[0]?.trim();
    const value = parts[1]?.trim();
    if (name) {
      cookies[name] = value;
    }
  });
  return cookies;
}

export async function createSession(env, username) {
  const sessionId = crypto.randomUUID();
  await env.HOUSE_RENT_KV.put(
    `session:${sessionId}`,
    JSON.stringify({ username, createdAt: new Date().toISOString() }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );

  const cookieValue = `session_token=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
  return cookieValue;
}

export async function validateSession(request, env) {
  const cookies = parseCookies(request);
  const sessionId = cookies["session_token"];
  if (!sessionId) {
    return null;
  }

  const sessionData = await env.HOUSE_RENT_KV.get(`session:${sessionId}`, { type: "json" });
  if (!sessionData) {
    return null;
  }

  return sessionData;
}

export async function destroySession(request, env) {
  const cookies = parseCookies(request);
  const sessionId = cookies["session_token"];
  if (sessionId) {
    await env.HOUSE_RENT_KV.delete(`session:${sessionId}`);
  }
  return "session_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}