import type { SessionClaims } from "./token";

/** Who may see a flat's ledger, receipts, complaints and photos. */
export function canViewFlat(session: SessionClaims | null, flatId: string): boolean {
  if (!session) return false;
  if (session.role === "STAFF") return true;
  if (session.role === "RESIDENT") return session.flatId === flatId;
  return false; // committee sees aggregates and flat codes on the dashboard, not ledgers or photos
}
