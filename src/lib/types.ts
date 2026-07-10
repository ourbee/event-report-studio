// Shared types for the whole workflow.

export type Mode = "template" | "quick";

export type Confidence = "high" | "medium" | "low" | "missing";

export interface ExtractedField {
  value: string;
  confidence: Confidence;
}

// The exact field schema from the MVP spec (§10).
export const FIELD_KEYS = [
  "institutionName",
  "organizingBody",
  "eventTitle",
  "eventType",
  "date",
  "time",
  "venue",
  "coordinator",
  "resourcePerson",
  "studentCount",
  "facultyCount",
  "totalParticipants",
  "objective",
  "highlights",
  "outcome",
  "remarks",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export type Fields = Record<FieldKey, ExtractedField>;

export const FIELD_LABELS: Record<FieldKey, string> = {
  institutionName: "Institution name",
  organizingBody: "Department / club / organizing body",
  eventTitle: "Event title",
  eventType: "Event type",
  date: "Date",
  time: "Time",
  venue: "Venue",
  coordinator: "Coordinator name",
  resourcePerson: "Speaker / chief guest / resource person",
  studentCount: "Number of students",
  facultyCount: "Number of faculty",
  totalParticipants: "Total participants",
  objective: "Objective of the event",
  highlights: "Main activities / highlights",
  outcome: "Outcome / impact / key takeaways",
  remarks: "Additional remarks",
};

// Fields rendered as multi-line textareas on the review screen.
export const LONG_FIELDS: FieldKey[] = ["objective", "highlights", "outcome", "remarks"];

export function emptyFields(): Fields {
  const out = {} as Fields;
  for (const k of FIELD_KEYS) out[k] = { value: "", confidence: "missing" };
  return out;
}

// A parsed upload: extracted text plus how the read went.
export type DocKind = "template" | "notice" | "flyer" | "attendance" | "photo" | "other";

export interface ParsedDoc {
  name: string;
  kind: DocKind;
  text: string;
  status: "ok" | "partial" | "failed";
  note: string; // user-facing note, e.g. "read via OCR"
}

// A photo kept in-session for the annexure.
export interface PhotoItem {
  name: string;
  dataUrl: string; // JPEG data URL, downscaled
  caption: string;
  width: number;
  height: number;
}

// Template structure detected in Template Mode.
export interface TemplateStructure {
  sections: string[]; // heading order to follow
  hasSignatureBlock: boolean;
  note: string; // e.g. "Template structure was only partially detected."
}

export interface ReportSection {
  heading: string;
  body: string;
}

export interface Report {
  title: string;
  sections: ReportSection[];
}

// Quick Mode default structure (spec §14).
export const QUICK_MODE_SECTIONS = [
  "Introduction",
  "Objective of the Event",
  "Event Details",
  "Description of Proceedings",
  "Participation Details",
  "Outcome and Impact",
  "Conclusion",
];
