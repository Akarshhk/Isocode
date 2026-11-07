import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  HOME_FOR_ROLE,
  SESSION_COOKIE,
  SESSION_DAYS,
  signSession,
  verifySession,
  type Role,
  type SessionClaims,
} from "./token";

export type Session = SessionClaims;

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function startSession(claims: SessionClaims): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(claims), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Server-side guard for pages and actions. Middleware checks too; this is the second lock. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!roles.includes(s.role)) redirect(HOME_FOR_ROLE[s.role]);
  return s;
}

/** Residents need a linked flat for everything they do. */
export async function requireResident(): Promise<Session & { flatId: string }> {
  const s = await requireRole("RESIDENT");
  if (!s.flatId) redirect("/login");
  return s as Session & { flatId: string };
}
