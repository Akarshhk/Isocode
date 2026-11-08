import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aiStatus } from "@/lib/complaints/provider";
import { demoMode } from "@/lib/auth/otp";
import { sessionSecretProblem } from "@/lib/auth/token";

// Public status check for uptime monitors and for diagnosing a deploy.
// Reports whether each setting is present, never its value.
export const dynamic = "force-dynamic";

export async function GET() {
  const sessionSecret = sessionSecretProblem() ?? "ok";

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
