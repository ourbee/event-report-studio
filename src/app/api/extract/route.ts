/*
 * Copyright © 2026 Ritwik Balo. All rights reserved.
 * https://github.com/ourbee
 */

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

Field keys (use all of them): institutionName, institutionAddress, organizingBody, eventTitle, eventType, date, time, venue, coordinator, resourcePerson, studentCount, facultyCount, totalParticipants, objective, highlights, outcome, remarks.

Rules:
- Extract only what the documents actually say. Never invent details.
- If a field is not present, set value to "" and confidence to "low".
- Dates: write in full, e.g. "12 August 2026". If ambiguous, pick the best reading with confidence "low".
- studentCount / facultyCount / totalParticipants: plain numbers as strings (e.g. "85"). For attendance lists, count entries if a stated total is absent, and mark confidence "medium" or "low".
- highlights / objective / outcome: 1-3 short sentences each, drawn from the documents.
- OCR text may be noisy; read past obvious OCR errors but lower confidence accordingly.
- institutionAddress: the institution's postal address / locality line as printed on the letterhead or notice (e.g. "Sevoke Road, Siliguri, West Bengal").
- For a TEMPLATE document, list its section headings in order in templateStructure.sections (max 12), detect whether it ends with a signature/footer block, and set detection to "partial" if the structure is only partly clear.`;

const STRUCTURE_SYSTEM_PROMPT = `You read the text of a sample/template academic event report from an Indian college and detect its structure.

Return ONLY a JSON object of this exact shape:
{
  "templateStructure": {
    "sections": ["<section heading or row label in order>", ...],
    "layout": "table" | "narrative",
    "hasSignatureBlock": true/false,
    "detection": "full" | "partial" | "failed"
  }
}

Rules:
- layout "table": the template is a form of label–value rows — labels such as "NAME OF THE PROGRAMME:", "VENUE:", "MODE (Online/Offline/Hybrid):", usually ending with a colon, each followed or accompanied by its value. Most Indian college activity-report formats are like this. In that case sections are the row labels in reading order, written in Title Case without the trailing colon (keep any bracketed hints, e.g. "Mode (Online/Offline/Hybrid)").
- layout "narrative": a flowing document with section headings followed by paragraphs. Sections are the headings in reading order.
- Max 12 sections. Ignore letterhead lines (institution name/address), the report title itself, page numbers and photo captions.
- hasSignatureBlock: true if the document ends with signature lines (e.g. Organiser / Coordinator / HOD / Principal).
- Set detection to "partial" if the structure is only partly clear (e.g. noisy OCR), or "failed" with an empty sections list if no structure is recognisable.`;

const FACTS_SYSTEM_PROMPT = `You read text extracted from academic event documents (notices, flyers, attendance sheets) from Indian colleges and list the key facts each document states, so the user can confirm the file was read correctly.

Return ONLY a JSON object of this exact shape:
{
  "facts": {
    "<document name exactly as given>": ["<short fact>", ...]
  }
}

Rules:
- 2 to 6 facts per document, each a short "Label: value" line, e.g. "Date: 16 January 2025", "Venue: Room 311", "Organiser: Department of English", "Resource person: Mr. R. Balo", "Time: 9:30 AM", "Students attended: 38", "Faculty attended: 2".
- Only facts the document actually states — never invent or guess.
- For attendance sheets/lists: state attendance counts. If a total is stated, use it; otherwise count the entries and phrase it as "Students counted: N (from list)".
- If a document contains no clear facts, return an empty list for it.`;

const SUGGEST_SYSTEM_PROMPT = `You draft ONE field of a formal academic event report for an Indian college, based on the uploaded event documents.

Return ONLY a JSON object: { "suggestion": "<the drafted text>" }

Rules:
- Write 1-3 sentences in formal institutional tone, third person, SIMPLE PAST TENSE (the event has already taken place).
- Ground the draft in what the documents say; you may reasonably infer intent or impact from the nature of the event, but NEVER invent names, numbers, dates or quotes.
- Return plain text only — no heading, no label, no quotation marks around the whole text.`;

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
    layout: obj.layout === "table" ? "table" : "narrative",
    hasSignatureBlock: Boolean(obj.hasSignatureBlock),
    note:
      detection === "partial"
        ? "Template structure was only partially detected. Please check the section order below."
        : "",
  };
}

export async function POST(req: NextRequest) {
  let body: {
    docs?: { name?: string; kind?: string; text?: string }[];
    structureOnly?: boolean;
    factsOnly?: boolean;
    suggestField?: string;
  };
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

  // Structure-only mode: detect the template's section headings right after
  // upload, so the user can confirm/edit them before anything else happens.
  if (body.structureOnly) {
    const tpl = docs.find((d) => d.kind === "template") ?? docs[0];
    const prompt = `=== TEMPLATE / SAMPLE REPORT — ${tpl.name} ===\n${trimHeadTail(tpl.text, TEMPLATE_CHARS)}\n\nDetect the template structure now.`;
    try {
      const raw = await groqJson(STRUCTURE_SYSTEM_PROMPT, prompt, 800);
      return NextResponse.json({ templateStructure: sanitizeTemplate(raw.templateStructure) });
    } catch (e) {
      const err =
        e instanceof GroqError ? e : new GroqError("Template reading failed. Please try again.");
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
  }

  // Facts-only mode: right after upload, list the key facts each file states
  // so the user can confirm it was read correctly.
  if (body.factsOnly) {
    const perDoc = Math.min(PER_DOC_CHARS, Math.floor(TOTAL_CHARS / docs.length));
    let prompt = "";
    for (const d of docs) {
      prompt += `=== ${d.kind.toUpperCase()} — ${d.name} ===\n${trimHeadTail(d.text, perDoc)}\n\n`;
    }
    prompt += "List the key facts per document now.";
    try {
      const raw = await groqJson(FACTS_SYSTEM_PROMPT, prompt, 1200);
      const facts: Record<string, string[]> = {};
      if (raw.facts && typeof raw.facts === "object") {
        for (const [name, list] of Object.entries(raw.facts as Record<string, unknown>)) {
          facts[name.slice(0, 200)] = (Array.isArray(list) ? list : [])
            .map((f) => String(f).slice(0, 160).trim())
            .filter(Boolean)
            .slice(0, 6);
        }
      }
      return NextResponse.json({ facts });
    } catch (e) {
      const err =
        e instanceof GroqError ? e : new GroqError("Fact detection failed. Please try again.");
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
  }

  // Suggest mode: draft one narrative field (objective / outcome / …) from the
  // evidence documents on request from the review screen.
  if (body.suggestField) {
    const label = String(body.suggestField).slice(0, 120);
    const evidenceDocs = docs.filter((d) => d.kind !== "template");
    if (evidenceDocs.length === 0) {
      return NextResponse.json({ error: "No documents to suggest from." }, { status: 400 });
    }
    const perDoc = Math.min(PER_DOC_CHARS, Math.floor(TOTAL_CHARS / evidenceDocs.length));
    let prompt = `FIELD TO DRAFT: ${label}\n\n`;
    for (const d of evidenceDocs) {
      prompt += `=== ${d.kind.toUpperCase()} — ${d.name} ===\n${trimHeadTail(d.text, perDoc)}\n\n`;
    }
    prompt += `Draft the "${label}" field now.`;
    try {
      const raw = await groqJson(SUGGEST_SYSTEM_PROMPT, prompt, 500);
      const suggestion = String(raw.suggestion ?? "").slice(0, 2000).trim();
      if (!suggestion) {
        return NextResponse.json(
          { error: "No suggestion could be drafted from the uploads." },
          { status: 502 }
        );
      }
      return NextResponse.json({ suggestion });
    } catch (e) {
      const err =
        e instanceof GroqError ? e : new GroqError("Suggestion failed. Please try again.");
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
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
