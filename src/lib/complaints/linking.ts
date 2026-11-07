import type { CategoryT, ScopeT, TeamT } from "./rules";

/** Window in which a new common-area report is treated as the same incident. */
export const DUPLICATE_WINDOW_HOURS = 24;

export type OpenComplaint = {
  id: string;
  towerId: string;
  category: CategoryT;
  scope: ScopeT;
  createdAt: Date;
  duplicateOfId: string | null;
  status: string;
};

/**
 * Finds the report a new complaint should be linked to: the earliest open, common-area complaint
 * of the same category in the same tower within the window. In-flat issues (a leak in one flat)
 * are never linked: two flats with leaks are two jobs. Linked reports are never closed
 * automatically.
 */
export function findDuplicateRoot(
  incoming: { towerId: string; category: CategoryT; scope: ScopeT; createdAt: Date },
  open: OpenComplaint[],
): OpenComplaint | null {
  if (incoming.scope !== "COMMON") return null;
  const since = incoming.createdAt.getTime() - DUPLICATE_WINDOW_HOURS * 3_600_000;
  const matches = open
    .filter(
      (c) =>
        c.towerId === incoming.towerId &&
        c.category === incoming.category &&
        c.scope === "COMMON" &&
        c.status !== "CLOSED" &&
        c.createdAt.getTime() >= since,
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (matches.length === 0) return null;
  const first = matches[0];
  // Always link to the root of a chain, not to another duplicate.
  if (first.duplicateOfId) return open.find((c) => c.id === first.duplicateOfId) ?? first;
  return first;
}

export type StaffLoad = { id: string; team: TeamT; openCount: number; active: boolean };

/** Least-loaded active person in the team; falls back to the help desk. Ties go to the first by id. */
export function pickAssignee(team: TeamT, staff: StaffLoad[]): string | null {
  const pick = (t: TeamT) =>
    staff
      .filter((s) => s.active && s.team === t)
      .sort((a, b) => a.openCount - b.openCount || a.id.localeCompare(b.id))[0]?.id ?? null;
  return pick(team) ?? pick("HELPDESK");
}
