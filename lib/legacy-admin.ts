import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const LEGACY_ADMIN_COOKIE = "infinity_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;

function signingSecret() {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

export function legacyAdminEnabled() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 12 && signingSecret());
}

export function verifyLegacyAdminPassword(password: string) {
  const configured = process.env.ADMIN_PASSWORD;
  const secret = signingSecret();
  if (!configured || !secret || configured.length < 12) return false;
  const received = createHmac("sha256", secret).update(password).digest();
  const expected = createHmac("sha256", secret).update(configured).digest();
  return timingSafeEqual(received, expected);
}

function signature(payload: string) {
  const secret = signingSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createLegacyAdminToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function isValidLegacyAdminToken(token?: string) {
  const secret = signingSecret();
  if (!token || !secret) return false;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return false;
  const expected = Buffer.from(signature(payload));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof data.exp === "number" && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function isLegacyAdmin() {
  const cookieStore = await cookies();
  return isValidLegacyAdminToken(cookieStore.get(LEGACY_ADMIN_COOKIE)?.value);
}

export function legacyAdminSessionSeconds() {
  return SESSION_SECONDS;
}
