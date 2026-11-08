import { z } from "zod";
import { AiDeclinedError, AiNotConfiguredError, type AiResult } from "./ai-prompt";
import { classifyWithClaude, claudeModel, describeClaudeError } from "./claude";
import { classifyWithGemini, describeGeminiError, geminiModel } from "./gemini";

// Picks the AI provider from the keys that are set. Either one can classify complaints;
// with neither, the keyword fallback does all the work.

export type AiProvider = "gemini" | "claude";

type Env = Record<string, string | undefined>;

/** Whichever key is set. If both are, AI_PROVIDER decides, else Gemini. */
export function activeAiProvider(env: Env = process.env): AiProvider | null {
  const gemini = Boolean(env.GEMINI_API_KEY);
  const claude = Boolean(env.ANTHROPIC_API_KEY);
  const preferred = env.AI_PROVIDER?.trim().toLowerCase();
  if (preferred === "claude" && claude) return "claude";
  if (preferred === "gemini" && gemini) return "gemini";
  if (gemini) return "gemini";
  if (claude) return "claude";
  return null;
}

/** For the health check and logs, e.g. "gemini (gemini-3.8-flash)". */
export function aiStatus(): string {
  const p = activeAiProvider();
  if (p === "gemini") return `gemini (${geminiModel()})`;
  if (p === "claude") return `claude (${claudeModel()})`;
  return "not configured (keyword fallback in use)";
}

/** Classifies with the configured provider. Throws on any failure so the caller falls back. */
export async function classifyWithAi(text: string): Promise<AiResult> {
  const p = activeAiProvider();
  try {
    if (p === "gemini") return await classifyWithGemini(text);
    if (p === "claude") return await classifyWithClaude(text);
    throw new AiNotConfiguredError();
  } catch (err) {
    if (p) {
      // Server log only (never the complaint text or the key), so a failing provider is diagnosable.
      console.warn(`[ai] ${p} failed, using keyword fallback: ${describeAiError(err)} (${err instanceof Error ? err.message : String(err)})`);
    }
    throw err;
  }
}

/** One short reason shown to the help desk next to a fallback classification. */
export function describeAiError(err: unknown): string {
  if (err instanceof AiNotConfiguredError) return "AI not configured";
  if (err instanceof AiDeclinedError) return "AI declined to classify";
  const fromProvider = describeClaudeError(err) ?? describeGeminiError(err);
  if (fromProvider) return fromProvider;
  if (err instanceof z.ZodError || err instanceof SyntaxError) return "AI returned invalid output";
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return "AI timed out";
  return "AI unavailable";
}
