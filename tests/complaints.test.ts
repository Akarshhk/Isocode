import { describe, expect, it } from "vitest";
import { classifyComplaint } from "@/lib/complaints/classify";
import { classifyByKeywords } from "@/lib/complaints/keywords";
import { findDuplicateRoot, pickAssignee, type OpenComplaint } from "@/lib/complaints/linking";
import { allowedUrgency, detectSafety } from "@/lib/complaints/rules";
import type { AiResult } from "@/lib/complaints/ai-prompt";

const aiSays = (r: Partial<AiResult>) => async (): Promise<AiResult> => ({
  category: "OTHER",
  urgency: "LOW",
  scope: "FLAT",
  confidence: 0.9,
  reason: "test",
  ...r,
});
const aiFails = async (): Promise<AiResult> => {
  throw new Error("timeout");
};

describe("safety rule", () => {
  it.each([
    ["Lift stuck between 7th and 8th floor", "lift stuck"],
    ["Someone is trapped in the elevator", "lift stuck"],
    ["Strong smell of gas in the kitchen", "gas"],
    ["Sparking from the switch board", "electric shock"],
    ["Got a shock from the geyser", "electric shock"],
    ["Fire in the meter room", "fire"],
    ["लिफ्ट अडकली आहे", "lift stuck"],
    ["Ghar mein aag lagi hai", "fire"],
    ["करंट आ रहा है", "electric shock"],
  ])("%s -> %s", (text, label) => expect(detectSafety(text)).toBe(label));

  it("does not fire on ordinary complaints", () => {
    expect(detectSafety("Kitchen tap leaking")).toBeNull();
    expect(detectSafety("Lift is slow")).toBeNull();
  });

  it("never lets urgency drop below Critical once it fired", () => {
    expect(allowedUrgency("LOW", "gas")).toBe("CRITICAL");
    expect(allowedUrgency("LOW", null)).toBe("LOW");
  });
});

describe("classifyComplaint", () => {
  it("forces Critical when the AI says Low but a safety word is present", async () => {
    const c = await classifyComplaint("Lift stuck, people inside", aiSays({ category: "LIFT", urgency: "LOW" }));
    expect(c.urgency).toBe("CRITICAL");
    expect(c.aiUrgency).toBe("LOW");
    expect(c.safetyKeyword).toBe("lift stuck");
  });

  it("still escalates safety words when the AI is down", async () => {
    const c = await classifyComplaint("Gas leak near the meter room", aiFails);
    expect(c.classifiedBy).toBe("FALLBACK");
    expect(c.urgency).toBe("CRITICAL");
    expect(c.needsReview).toBe(true);
  });

  it("uses the keyword fallback when the AI fails, and flags it for review", async () => {
    const c = await classifyComplaint("Water leaking from the kitchen pipe", aiFails, () => "AI timed out");
    expect(c).toMatchObject({ category: "PLUMBING", classifiedBy: "FALLBACK", needsReview: true });
    expect(c.aiReason).toContain("AI timed out");
  });

  it("keeps the AI's answer but flags low confidence", async () => {
    const c = await classifyComplaint("Problem in flat", aiSays({ category: "CIVIL", urgency: "MEDIUM", confidence: 0.4 }));
    expect(c).toMatchObject({ category: "CIVIL", classifiedBy: "AI", needsReview: true });
  });

  it("trusts a confident AI answer without review", async () => {
    const c = await classifyComplaint("Seepage on the bedroom wall", aiSays({ category: "CIVIL", urgency: "MEDIUM", confidence: 0.92 }));
    expect(c.needsReview).toBe(false);
  });

  it("treats lift problems as common-area even if the AI says flat", async () => {
    const c = await classifyComplaint("Lift is slow", aiSays({ category: "LIFT", scope: "FLAT" }));
    expect(c.scope).toBe("COMMON");
  });
});

describe("keyword fallback", () => {
  it("classifies common cases", () => {
    expect(classifyByKeywords("No water supply in the tower").category).toBe("PLUMBING");
    expect(classifyByKeywords("No water supply in the tower").scope).toBe("COMMON");
    expect(classifyByKeywords("Cockroaches in kitchen").category).toBe("PEST_CONTROL");
    expect(classifyByKeywords("Something odd").category).toBe("OTHER");
  });
});

describe("duplicate linking", () => {
  const base = new Date("2026-11-07T10:00:00Z");
  const open: OpenComplaint[] = [
    { id: "root", towerId: "T12", category: "LIFT", scope: "COMMON", createdAt: new Date(base.getTime() - 3_600_000), duplicateOfId: null, status: "IN_PROGRESS" },
    { id: "dup", towerId: "T12", category: "LIFT", scope: "COMMON", createdAt: new Date(base.getTime() - 1_800_000), duplicateOfId: "root", status: "ASSIGNED" },
    { id: "leak", towerId: "T12", category: "PLUMBING", scope: "FLAT", createdAt: base, duplicateOfId: null, status: "ASSIGNED" },
  ];

  it("links a common-area report to the earliest open report in the same tower", () => {
    expect(findDuplicateRoot({ towerId: "T12", category: "LIFT", scope: "COMMON", createdAt: base }, open)?.id).toBe("root");
  });
  it("never links in-flat issues", () => {
    expect(findDuplicateRoot({ towerId: "T12", category: "PLUMBING", scope: "FLAT", createdAt: base }, open)).toBeNull();
  });
  it("doesn't link across towers or outside the 24-hour window", () => {
    expect(findDuplicateRoot({ towerId: "T07", category: "LIFT", scope: "COMMON", createdAt: base }, open)).toBeNull();
    const later = new Date(base.getTime() + 30 * 3_600_000);
    expect(findDuplicateRoot({ towerId: "T12", category: "LIFT", scope: "COMMON", createdAt: later }, open)).toBeNull();
  });
});

describe("auto-assignment", () => {
  it("picks the least-loaded active person in the team, else the help desk", () => {
    const staff = [
      { id: "p1", team: "PLUMBING" as const, openCount: 4, active: true },
      { id: "p2", team: "PLUMBING" as const, openCount: 1, active: true },
      { id: "p3", team: "PLUMBING" as const, openCount: 0, active: false },
      { id: "h1", team: "HELPDESK" as const, openCount: 9, active: true },
    ];
    expect(pickAssignee("PLUMBING", staff)).toBe("p2");
    expect(pickAssignee("CIVIL", staff)).toBe("h1");
  });
});
