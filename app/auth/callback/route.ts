import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const isPasswordRecovery = request.nextUrl.searchParams.get("next") === "/reset-password";
  if (!code) return NextResponse.redirect(new URL(isPasswordRecovery ? "/lupa-password?expired=1" : "/login", request.url));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(isPasswordRecovery ? "/lupa-password?expired=1" : "/login?link=invalid", request.url));
  }

  const response = NextResponse.redirect(new URL(isPasswordRecovery ? "/reset-password" : "/", request.url));
  if (isPasswordRecovery) {
    response.cookies.set("password_recovery", "1", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
  }
  return response;
}
