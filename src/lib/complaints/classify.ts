import type { AiResult } from "./ai";
import { classifyByKeywords } from "./keywords";
import { allowedUrgency, detectSafety, type CategoryT, type ScopeT, type UrgencyT } from "./rules";

export const LOW_CONFIDENCE = 0.6;

export type Classification = {
  category: CategoryT;
  urgency: UrgencyT;
  scope: ScopeT;
  classifiedBy: "AI" | "FALLBACK";
  aiCategory: CategoryT | null;
  aiUrgency: UrgencyT | null;
  aiConfidence: number | null;
  aiReason: string;
  needsReview: boolean;
  safetyKeyword: string | null;
};

/**
 * Decides category and urgency. Order matters:
 * 1. The safety rule is checked on the raw text, independent of the AI.
 * 2. The AI suggests category/urgency/scope. On any failure the keyword fallback is used.
 * 3. Low confidence or fallback -> flagged "needs review" for the help desk.
 * 4. Safety wins: urgency is forced to Critical; the AI can never lower it.
 */
export async function classifyComplaint(
  text: string,
  ai: (t: string) => Promise<AiResult>,
  describeError: (e: unknown) => string = () => "AI unavailable",
): Promise<Classification> {
  const safetyKeyword = detectSafety(text);
  let base: Omit<Classification, "safetyKeyword" | "urgency"> & { urgency: UrgencyT };
  try {
    const r = await ai(text);
    base = {
      category: r.category,
      urgency: r.urgency,
      scope: r.category === "LIFT" ? "COMMON" : r.scope,
      classifiedBy: "AI",
      aiCategory: r.category,
      aiUrgency: r.urgency,
      aiConfidence: r.confidence,
      aiReason: r.reason,
      needsReview: r.confidence < LOW_CONFIDENCE,
    };
  } catch (err) {
    const k = classifyByKeywords(text);
    base = {
      category: k.category,
      urgency: k.urgency,
      scope: k.scope,
      classifiedBy: "FALLBACK",
      aiCategory: null,
      aiUrgency: null,
      aiConfidence: null,
      aiReason: `${describeError(err)}. ${k.reason}`,
      needsReview: true,
    };
  }
  return { ...base, urgency: allowedUrgency(base.urgency, safetyKeyword), safetyKeyword };
}
