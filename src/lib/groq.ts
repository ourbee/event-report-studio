/*
 * Copyright © 2026 Ritwik Balo. All rights reserved.
 * https://github.com/ourbee
 */

// Server-side helper: call Groq chat completions with JSON output and
// automatic model fallback (pattern reused from ClaimGuard).

import { candidateModels, invalidateModelCache } from "./models";

const COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

export class GroqError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

// Strips code fences / stray prose and parses the first JSON object found.
export function parseJsonObject(content: string): Record<string, unknown> | null {
  let text = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  text = text.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function groqJson(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<Record<string, unknown>> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqError(
      "The server is missing its GROQ_API_KEY. Add it in the environment settings and redeploy.",
      500
    );
  }

  const models = await candidateModels("text", apiKey);
  let lastError = "The AI service could not be reached.";

  for (const model of models) {
    try {
      const res = await fetch(COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(55_000),
      });

      if (res.status === 429) {
        lastError =
          "The AI service is busy right now (rate limit). Please wait about a minute and try again.";
        continue;
      }
      if (res.status === 400 || res.status === 404) {
        // Likely a retired/renamed model — try the next candidate.
        invalidateModelCache();
        lastError = "The AI model was unavailable. Please try again.";
        continue;
      }
      if (!res.ok) {
        lastError = "The AI service returned an error. Please try again.";
        continue;
      }

      const data = await res.json();
      const content: string = data?.choices?.[0]?.message?.content ?? "";
      const parsed = parseJsonObject(content);
      if (parsed) return parsed;
      lastError = "The AI reply could not be understood. Please try again.";
    } catch {
      lastError = "The AI service timed out. Please try again.";
    }
  }

  throw new GroqError(lastError, 502);
}

// Rough char budget so we stay inside free-tier token-per-minute limits.
export const CHARS_PER_TOKEN = 3.5;

export function trimHeadTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.ceil(maxChars * 0.7);
  const tail = maxChars - head;
  return (
    text.slice(0, head) +
    "\n[... middle of document trimmed ...]\n" +
    text.slice(text.length - tail)
  );
}
