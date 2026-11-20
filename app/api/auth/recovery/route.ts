import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("password_recovery");
  return NextResponse.json({ ok: true });
}
