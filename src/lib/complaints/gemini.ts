import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type GenerateContentResponse } from "@google/genai";
import {
  AiDeclinedError,
  CLASSIFY_JSON_SCHEMA,
  CLASSIFY_SYSTEM,
  complaintMessage,
  parseClassification,
  type AiResult,
} from "./ai-prompt";

// Gemini classifies the complaint text through the Gemini API (Google AI Studio key).

export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  // The SDK retries 5 times with up to 60 s back-off by default; a resident is waiting, so
  // allow one retry inside an 8 s per-attempt timeout, then fall back to keywords.
  client ??= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 8_000, retryOptions: { attempts: 2 } },
  });
  return client;
}

/** Calls Gemini. Throws on any failure (network, timeout, block, invalid output). */
export async function classifyWithGemini(text: string): Promise<AiResult> {
  const response = await getClient().models.generateContent({
    model: geminiModel(),
    contents: complaintMessage(text),
    config: {
      systemInstruction: CLASSIFY_SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: CLASSIFY_JSON_SCHEMA,
      // Classification needs little reasoning; low thinking keeps it fast and cheap.
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      maxOutputTokens: 4_000,
      // Hard cap across both attempts.
      abortSignal: AbortSignal.timeout(15_000),
    },
  });
  return readGeminiResponse(response);
}

type GeminiReply = Pick<GenerateContentResponse, "text" | "candidates" | "promptFeedback">;

/** Turns a Gemini reply into a validated result, or throws. Kept pure so it can be unit-tested. */
export function readGeminiResponse(reply: GeminiReply): AiResult {
  const blocked = reply.promptFeedback?.blockReason;
  if (blocked) throw new AiDeclinedError(`prompt blocked (${blocked})`);
  const finish = reply.candidates?.[0]?.finishReason;
  if (finish === FinishReason.MAX_TOKENS) throw new Error("Model output was cut off");
  if (finish && finish !== FinishReason.STOP) throw new AiDeclinedError(`stopped (${finish})`);
  const text = reply.text;
  if (!text) throw new Error("No text in model response");
  return parseClassification(text);
}

/** Short reason for the help desk when a Gemini call fails, or null if the error isn't Gemini's. */
export function describeGeminiError(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 429) return "AI rate-limited";
  // An invalid key comes back as 400 "API key not valid", not 401.
  if (err.status === 401 || err.status === 403 || /api key/i.test(err.message)) return "AI key rejected";
  return `AI error ${err.status}`;
}
