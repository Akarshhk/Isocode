import { SignJWT, jwtVerify } from "jose";

// Edge-safe (used by middleware): no Node APIs, no database.

export const SESSION_COOKIE = "tw_session";
export const SESSION_DAYS = 7;

export type Role = "RESIDENT" | "STAFF" | "COMMITTEE";
export type SessionClaims = { sub: string; role: Role; name: string; flatId: string | null };

export function sessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters (see .env.example).");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, name: claims.name, flatId: claims.flatId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionSecret());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    const role = payload.role;
    if (role !== "RESIDENT" && role !== "STAFF" && role !== "COMMITTEE") return null;
    return {
      sub: String(payload.sub),
      role,
      name: String(payload.name ?? ""),
      flatId: typeof payload.flatId === "string" ? payload.flatId : null,
    };
  } catch {
    return null;
  }
}

/** Where each role lands after sign-in. */
export const HOME_FOR_ROLE: Record<Role, string> = { RESIDENT: "/home", STAFF: "/desk", COMMITTEE: "/committee" };

const AREAS: { prefix: string; roles: Role[] }[] = [
  { prefix: "/home", roles: ["RESIDENT"] },
  { prefix: "/dues", roles: ["RESIDENT"] },
  { prefix: "/pay", roles: ["RESIDENT"] },
  { prefix: "/complaints", roles: ["RESIDENT"] },
  { prefix: "/receipts", roles: ["RESIDENT", "STAFF"] },
  { prefix: "/desk", roles: ["STAFF"] },
  { prefix: "/committee", roles: ["COMMITTEE", "STAFF"] },
  { prefix: "/api/photos", roles: ["RESIDENT", "STAFF"] },
];

/** null = public path; otherwise the roles allowed to open it. */
export function rolesForPath(pathname: string): Role[] | null {
  const area = AREAS.find((a) => pathname === a.prefix || pathname.startsWith(`${a.prefix}/`));
  return area ? area.roles : null;
}
