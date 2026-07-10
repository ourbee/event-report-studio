import { NextRequest, NextResponse } from "next/server";
import { groqJson, GroqError } from "@/lib/groq";
import {
  FIELD_KEYS,
  FIELD_LABELS,
  QUICK_MODE_SECTIONS,
  type Report,
  type ReportSection,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You write formal academic event reports for Indian colleges and universities.

You will receive confirmed event details and a required list of section headings. Write the full report.

Return ONLY a JSON object of this exact shape:
{
  "title": "<report title line>",
  "sections": [ { "heading": "<heading>", "body": "<paragraph text>" }, ... ]
}

Rules:
- Use EXACTLY the section headings given, in the given order. Do not add, drop, rename, or reorder sections.
- Formal, clear, institutional tone. Third person. No bullet points unless a section clearly calls for a short list.
- Use only the details provided. If a detail is missing, write around it gracefully — NEVER invent names, numbers, dates, or quotes.
- Each section: 2-6 sentences (participation/details sections may be shorter).
- The title should name the event and, where available, the organizing body and date.
- Keep paragraphs as plain text; separate multiple paragraphs inside a section with a blank line.`;

export async function POST(req: NextRequest) {
  let body: {
    fields?: Record<string, { value?: string }>;
    sections?: string[];
    photoCaptions?: string[];
    instruction?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const sections = (Array.isArray(body.sections) ? body.sections : [])
    .map((s) => String(s).slice(0, 120).trim())
    .filter(Boolean)
    .slice(0, 12);
  const headings = sections.length > 0 ? sections : QUICK_MODE_SECTIONS;

  let details = "";
  for (const key of FIELD_KEYS) {
    const value = String(body.fields?.[key]?.value ?? "").slice(0, 2000).trim();
    if (value) details += `${FIELD_LABELS[key]}: ${value}\n`;
  }
  if (!details) {
    return NextResponse.json(
      { error: "No event details were provided. Please fill in the review screen first." },
      { status: 400 }
    );
  }

  const captions = (Array.isArray(body.photoCaptions) ? body.photoCaptions : [])
    .map((c) => String(c).slice(0, 200).trim())
    .filter(Boolean)
    .slice(0, 10);

  let userPrompt = `CONFIRMED EVENT DETAILS:\n${details}\n`;
  if (captions.length > 0) {
    userPrompt += `\nPHOTO CAPTIONS (supporting evidence of what happened):\n- ${captions.join("\n- ")}\n`;
  }
  userPrompt += `\nREQUIRED SECTION HEADINGS, IN ORDER:\n${headings.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n`;
  const instruction = String(body.instruction ?? "").slice(0, 500).trim();
  if (instruction) userPrompt += `\nADDITIONAL USER INSTRUCTION: ${instruction}\n`;
  userPrompt += "\nWrite the report now.";

  try {
    const raw = await groqJson(SYSTEM_PROMPT, userPrompt, 3000);
    const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
    const byHeading = new Map<string, string>();
    for (const s of rawSections) {
      const obj = s as { heading?: unknown; body?: unknown };
      const h = String(obj?.heading ?? "").trim();
      const b = String(obj?.body ?? "").slice(0, 8000).trim();
      if (h && b) byHeading.set(h.toLowerCase(), b);
    }
    // Guarantee the agreed structure even if the model drifted.
    const outSections: ReportSection[] = headings.map((h) => ({
      heading: h,
      body: byHeading.get(h.toLowerCase()) ?? "",
    }));
    // If the model returned bodies under drifted headings, fill gaps in order.
    const leftovers = rawSections
      .map((s) => String((s as { body?: unknown })?.body ?? "").slice(0, 8000).trim())
      .filter(Boolean);
    let li = 0;
    for (const sec of outSections) {
      if (!sec.body && li < leftovers.length) sec.body = leftovers[li++];
      else if (sec.body) li++;
    }

    const report: Report = {
      title: String(raw.title ?? "Event Report").slice(0, 300).trim() || "Event Report",
      sections: outSections.filter((s) => s.body),
    };
    if (report.sections.length === 0) {
      return NextResponse.json(
        { error: "The report could not be generated. Please try again." },
        { status: 502 }
      );
    }
    return NextResponse.json({ report });
  } catch (e) {
    const err = e instanceof GroqError ? e : new GroqError("Generation failed. Please try again.");
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
