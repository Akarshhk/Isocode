// Fixed rules for complaints. These run regardless of what the AI says.

export const CATEGORIES = [
  "PLUMBING",
  "ELECTRICAL",
  "LIFT",
  "SECURITY",
  "HOUSEKEEPING",
  "CIVIL",
  "PEST_CONTROL",
  "PARKING",
  "OTHER",
] as const;
export type CategoryT = (typeof CATEGORIES)[number];

export const URGENCIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type UrgencyT = (typeof URGENCIES)[number];

export type ScopeT = "FLAT" | "COMMON";

export const CATEGORY_LABEL: Record<CategoryT, string> = {
  PLUMBING: "Plumbing & water",
  ELECTRICAL: "Electrical",
  LIFT: "Lift",
  SECURITY: "Security",
  HOUSEKEEPING: "Housekeeping",
  CIVIL: "Civil & seepage",
  PEST_CONTROL: "Pest control",
  PARKING: "Parking",
  OTHER: "Other",
};

export const URGENCY_LABEL: Record<UrgencyT, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

/** Minutes allowed before the first response. Assumption, configurable. */
export const RESPONSE_MINUTES: Record<UrgencyT, number> = {
  CRITICAL: 15,
  HIGH: 120,
  MEDIUM: 480,
  LOW: 1440,
};

export type TeamT = "HELPDESK" | "PLUMBING" | "ELECTRICAL" | "LIFT" | "HOUSEKEEPING" | "SECURITY" | "CIVIL";

export const TEAM_FOR_CATEGORY: Record<CategoryT, TeamT> = {
  PLUMBING: "PLUMBING",
  ELECTRICAL: "ELECTRICAL",
  LIFT: "LIFT",
  SECURITY: "SECURITY",
  HOUSEKEEPING: "HOUSEKEEPING",
  CIVIL: "CIVIL",
  PEST_CONTROL: "HOUSEKEEPING",
  PARKING: "SECURITY",
  OTHER: "HELPDESK",
};

/**
 * Safety words. Any match makes the complaint Critical and escalates it to the duty manager,
 * whatever the AI says. English, Hindi and Marathi (Devanagari and common Roman spellings).
 * Over-escalating is the safe failure mode, so the list errs on the broad side.
 */
const SAFETY_RULES: { label: string; re: RegExp }[] = [
  { label: "fire", re: /\b(fire|on fire|burning|flames?)\b|आग|\baag\b/i },
  { label: "smoke", re: /\bsmoke|smoking from\b|धुआं|धूर/i },
  { label: "gas", re: /\bgas\b|\blpg\b|गैस|गॅस/i },
  {
    label: "lift stuck",
    re: /\b(lift|elevator)\b[^.]{0,30}\b(stuck|struck|jammed|trapped|band ho|atak|ruk)|\b(stuck|trapped|struck)\b[^.]{0,30}\b(lift|elevator)\b|लिफ्ट[^.]{0,20}(अडक|फंस|फँस|रुक)/i,
  },
  { label: "trapped", re: /\b(trapped|someone stuck|people stuck|child stuck)\b|फंस गए|अडकल/i },
  {
    label: "electric shock",
    re: /\b(shock|electrocut\w*|spark\w*|short ?circuit|live wire|current (is )?(coming|aa raha|lag))|करंट|झटका|शॉक|ठिणग/i,
  },
];

export function detectSafety(text: string): string | null {
  for (const rule of SAFETY_RULES) if (rule.re.test(text)) return rule.label;
  return null;
}

/** Can a person set this urgency? Never below Critical when the safety rule fired. */
export function allowedUrgency(requested: UrgencyT, safetyKeyword: string | null): UrgencyT {
  return safetyKeyword ? "CRITICAL" : requested;
}

/** Status changes the help desk may make. Closing and reopening belong to the resident. */
export const STAFF_TRANSITIONS: Record<string, string[]> = {
  ASSIGNED: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["IN_PROGRESS"],
  CLOSED: [],
};

/** Days after resolution in which the resident can reopen instead of close. */
export const REOPEN_WINDOW_DAYS = 7;
