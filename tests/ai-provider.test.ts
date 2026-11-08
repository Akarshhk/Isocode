import { describe, expect, it } from "vitest";
import { ApiError, FinishReason, BlockedReason } from "@google/genai";
import { AiDeclinedError, AiNotConfiguredError } from "@/lib/complaints/ai-prompt";
import { readGeminiResponse } from "@/lib/complaints/gemini";
import { activeAiProvider, describeAiError } from "@/lib/complaints/provider";
import { classifyComplaint } from "@/lib/complaints/classify";

const good = JSON.stringify({ category: "LIFT", urgency: "HIGH", scope: "COMMON", confidence: 0.93, reason: "Lift not working." });
const reply = (r: { text?: string; finish?: FinishReason; blocked?: BlockedReason }) => ({
  text: r.text,
  candidates: r.finish ? [{ finishReason: r.finish }] : undefined,
  promptFeedback: r.blocked ? { blockReason: r.blocked } : undefined,
});

describe("choosing the AI provider", () => {
  it("uses none without a key, so the keyword fallback runs", () => {
    expect(activeAiProvider({})).toBeNull();
    expect(activeAiProvider({ GEMINI_API_KEY: "" })).toBeNull();
  });
  it("uses whichever key is set", () => {
    expect(activeAiProvider({ GEMINI_API_KEY: "g" })).toBe("gemini");
    expect(activeAiProvider({ ANTHROPIC_API_KEY: "a" })).toBe("claude");
  });
  it("prefers Gemini when both are set, unless AI_PROVIDER says otherwise", () => {
    expect(activeAiProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" })).toBe("gemini");
    expect(activeAiProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", AI_PROVIDER: "Claude" })).toBe("claude");
  });
  it("ignores AI_PROVIDER when that provider has no key", () => {
    expect(activeAiProvider({ GEMINI_API_KEY: "g", AI_PROVIDER: "claude" })).toBe("gemini");
  });
});

describe("reading a Gemini reply", () => {
  it("returns the validated classification", () => {
    expect(readGeminiResponse(reply({ text: good, finish: FinishReason.STOP }))).toMatchObject({ category: "LIFT", urgency: "HIGH" });
  });
  it("rejects a blocked prompt", () => {
    expect(() => readGeminiResponse(reply({ blocked: BlockedReason.SAFETY }))).toThrow(AiDeclinedError);
  });
  it("rejects a safety stop and a cut-off reply", () => {
    expect(() => readGeminiResponse(reply({ text: good, finish: FinishReason.SAFETY }))).toThrow(AiDeclinedError);
    expect(() => readGeminiResponse(reply({ text: "{", finish: FinishReason.MAX_TOKENS }))).toThrow(/cut off/);
  });
  it("rejects empty, non-JSON and off-schema output", () => {
    expect(() => readGeminiResponse(reply({ finish: FinishReason.STOP }))).toThrow(/No text/);
    expect(() => readGeminiResponse(reply({ text: "Lift problem", finish: FinishReason.STOP }))).toThrow(SyntaxError);
    const offSchema = JSON.stringify({ category: "ELEVATOR", urgency: "HIGH", scope: "COMMON", confidence: 0.9, reason: "x" });
    expect(() => readGeminiResponse(reply({ text: offSchema, finish: FinishReason.STOP }))).toThrow();
  });
});

describe("explaining an AI failure to the help desk", () => {
  it.each([
    [new AiNotConfiguredError(), "AI not configured"],
    [new AiDeclinedError("stopped (SAFETY)"), "AI declined to classify"],
    [new ApiError({ message: "Resource exhausted", status: 429 }), "AI rate-limited"],
    [new ApiError({ message: "API key not valid. Please pass a valid API key.", status: 400 }), "AI key rejected"],
    [new ApiError({ message: "Internal error", status: 500 }), "AI error 500"],
    [new SyntaxError("Unexpected token"), "AI returned invalid output"],
    [Object.assign(new Error("signal timed out"), { name: "TimeoutError" }), "AI timed out"],
    [new Error("socket hang up"), "AI unavailable"],
  ])("%s -> %s", (err, expected) => expect(describeAiError(err)).toBe(expected));

  it("falls back to keywords with the reason when Gemini fails", async () => {
    const geminiDown = async () => {
      throw new ApiError({ message: "Resource exhausted", status: 429 });
    };
    const c = await classifyComplaint("Water leaking from the kitchen pipe", geminiDown, describeAiError);
    expect(c.classifiedBy).toBe("FALLBACK");
    expect(c.category).toBe("PLUMBING");
    expect(c.needsReview).toBe(true);
    expect(c.aiReason).toMatch(/^AI rate-limited\./);
  });
});
