import { NextRequest, NextResponse } from "next/server";
import { groqJson, GroqError, trimHeadTail } from "@/lib/groq";
import {
  FIELD_KEYS,
  emptyFields,
  type Fields,
  type Confidence,
  type TemplateStructure,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_DOCS = 12;
const PER_DOC_CHARS = 6000;
const TOTAL_CHARS = 18000;
const TEMPLATE_CHARS = 6000;

const SYSTEM_PROMPT = `You are an assistant that reads text extracted from academic event documents (notices, flyers, attendance sheets, circulars) from Indian colleges and extracts structured details for a formal event report.

Return ONLY a JSON object of this exact shape:
{
  "fields": {
    "<fieldKey>": { "value": "<string, empty if not found>", "confidence": "high" | "medium" | "low" }
  },
  "templateStructure": {
    "sections": ["<heading in order>", ...],
    "hasSignatureBlock": true/false,
    "detection": "full" | "partial" | "failed"
  } or null if no template document was provided
}

Field keys (use all of them): institutionName, organizingBody, eventTitle, eventType, date, time, venue, coordinator, resourcePerson, studentCount, facultyCount, totalParticipants, objective, highlights, outcome, remarks.

Rules:
- Extract only what the documents actually say. Never invent details.
- If a field is not present, set value to "" and confidence to "low".
- Dates: write in full, e.g. "12 August 2026". If ambiguous, pick the best reading with confidence "low".
- studentCount / facultyCount / totalParticipants: plain numbers as strings (e.g. "85"). For attendance lists, count entries if a stated total is absent, and mark confidence "medium" or "low".
- highlights / objective / outcome: 1-3 short sentences each, drawn from the documents.
- OCR text may be noisy; read past obvious OCR errors but lower confidence accordingly.
- For a TEMPLATE document, list its section headings in order in templateStructure.sections (max 12), detect whether it ends with a signature/footer block, and set detection to "partial" if the structure is only partly clear.`;

function sanitizeFields(raw: unknown): Fields {
  const out = emptyFields();
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, { value?: unknown; confidence?: unknown }>;
  for (const key of FIELD_KEYS) {
    const f = obj[key];
    if (!f || typeof f !== "object") continue;
    const value = typeof f.value === "string" ? f.value.slice(0, 2000).trim() : "";
    let confidence = String(f.confidence ?? "low") as Confidence;
    if (!["high", "medium", "low"].includes(confidence)) confidence = "low";
    out[key] = { value, confidence: value ? confidence : "missing" };
  }
  return out;
}

function sanitizeTemplate(raw: unknown): TemplateStructure | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const sections = (Array.isArray(obj.sections) ? obj.sections : [])
    .map((s) => String(s).slice(0, 120).trim())
    .filter(Boolean)
    .slice(0, 12);
  if (sections.length === 0) return null;
  const detection = String(obj.detection ?? "full");
  return {
    sections,
    hasSignatureBlock: Boolean(obj.hasSignatureBlock),
    note:
      detection === "partial"
        ? "Template structure was only partially detected. Please check the section order below."
        : "",
  };
}

export async function POST(req: NextRequest) {
  let body: { docs?: { name?: string; kind?: string; text?: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const docs = (Array.isArray(body.docs) ? body.docs : [])
    .slice(0, MAX_DOCS)
    .map((d) => ({
      name: String(d?.name ?? "file").slice(0, 200),
      kind: String(d?.kind ?? "other"),
      text: String(d?.text ?? ""),
    }))
    .filter((d) => d.text.trim().length > 0);

  if (docs.length === 0) {
    return NextResponse.json(
      { error: "No readable text was found in the uploaded files." },
      { status: 400 }
    );
  }

  // Budget: template gets its own slice; the rest share the remainder.
  const template = docs.find((d) => d.kind === "template");
  const evidence = docs.filter((d) => d.kind !== "template");
  const perDoc = Math.min(
    PER_DOC_CHARS,
    Math.floor(TOTAL_CHARS / Math.max(1, evidence.length))
  );

  let userPrompt = "";
  if (template) {
    userPrompt += `=== TEMPLATE / SAMPLE REPORT (structure guide) — ${template.name} ===\n${trimHeadTail(template.text, TEMPLATE_CHARS)}\n\n`;
  }
  for (const d of evidence) {
    userPrompt += `=== ${d.kind.toUpperCase()} — ${d.name} ===\n${trimHeadTail(d.text, perDoc)}\n\n`;
  }
  userPrompt += template
    ? "Extract the fields from the evidence documents and the structure from the template."
    : "Extract the fields from the documents. templateStructure must be null.";

  try {
    const raw = await groqJson(SYSTEM_PROMPT, userPrompt, 2000);
    return NextResponse.json({
      fields: sanitizeFields(raw.fields),
      templateStructure: template ? sanitizeTemplate(raw.templateStructure) : null,
    });
  } catch (e) {
    const err = e instanceof GroqError ? e : new GroqError("Extraction failed. Please try again.");
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
