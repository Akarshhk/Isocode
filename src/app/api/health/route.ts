import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aiStatus } from "@/lib/complaints/provider";
import { demoMode } from "@/lib/auth/otp";

// Public status check for uptime monitors and for diagnosing a deploy.
// Reports whether each setting is present, never its value.
export const dynamic = "force-dynamic";

export async function GET() {
  const secret = process.env.SESSION_SECRET;
  const sessionSecret = !secret ? "missing" : secret.length < 32 ? "too short (needs 32+ characters)" : "ok";

  let database = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }

  const ok = sessionSecret === "ok" && database === "ok";
  return NextResponse.json(
    {
      ok,
      checks: {
        database,
        sessionSecret,
        demoMode: demoMode(),
        ai: aiStatus(),
      },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
