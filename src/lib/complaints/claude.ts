import Anthropic from "@anthropic-ai/sdk";
import {
  AiDeclinedError,
  CLASSIFY_JSON_SCHEMA,
  CLASSIFY_SYSTEM,
  complaintMessage,
  parseClassification,
  type AiResult,
} from "./ai-prompt";

// Claude classifies the complaint text through the Anthropic API.

export const CLAUDE_DEFAULT_MODEL = "claude-haiku-5-5";

export function claudeModel(): string {
  return process.env.ANTHROPIC_MODEL || CLAUDE_DEFAULT_MODEL;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ timeout: 8_000, maxRetries: 1 });
  return client;
}

/** Calls Claude. Throws on any failure (network, timeout, refusal, invalid output). */
export async function classifyWithClaude(text: string): Promise<AiResult> {
  const response = await getClient().messages.create({
    model: claudeModel(),
    max_tokens: 2000,
    system: CLASSIFY_SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: CLASSIFY_JSON_SCHEMA } },
    messages: [{ role: "user", content: complaintMessage(text) }],
  });
  if (response.stop_reason === "refusal") throw new AiDeclinedError("refusal");
  if (response.stop_reason === "max_tokens") throw new Error("Model output was cut off");
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text in model response");
  return parseClassification(textBlock.text);
}

/** Short reason for the help desk when a Claude call fails, or null if the error isn't Claude's. */
export function describeClaudeError(err: unknown): string | null {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "AI timed out";
  if (err instanceof Anthropic.RateLimitError) return "AI rate-limited";
  if (err instanceof Anthropic.AuthenticationError) return "AI key rejected";
  if (err instanceof Anthropic.APIError) return `AI error ${err.status ?? ""}`.trim();
  return null;
}
