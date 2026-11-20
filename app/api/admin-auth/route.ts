import { NextResponse, type NextRequest } from "next/server";
import {
  createLegacyAdminToken,
  LEGACY_ADMIN_COOKIE,
  legacyAdminEnabled,
  legacyAdminSessionSeconds,
  verifyLegacyAdminPassword,
} from "@/lib/legacy-admin";

export async function POST(request: NextRequest) {
  if (!legacyAdminEnabled()) return NextResponse.json({ error: "Login admin belum dikonfigurasi." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin) return NextResponse.json({ error: "Origin tidak diizinkan." }, { status: 403 });
  try {
    const { password } = await request.json() as { password?: unknown };
    if (typeof password !== "string" || !verifyLegacyAdminPassword(password)) {
      return NextResponse.json({ error: "Kata sandi admin belum benar." }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(LEGACY_ADMIN_COOKIE, createLegacyAdminToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: legacyAdminSessionSeconds(),
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Permintaan login tidak valid." }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(LEGACY_ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
