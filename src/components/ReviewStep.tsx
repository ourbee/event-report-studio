"use client";

import { useState } from "react";
import {
  FIELD_KEYS,
  FIELD_LABELS,
  LONG_FIELDS,
  QUICK_MODE_SECTIONS,
  type Fields,
  type Mode,
  type ParsedDoc,
  type TemplateStructure,
} from "@/lib/types";

const CONFIDENCE_BADGE: Record<string, { label: string; cls: string }> = {
  high: { label: "extracted", cls: "bg-emerald-100 text-emerald-800" },
  medium: { label: "please verify", cls: "bg-amber-100 text-amber-800" },
  low: { label: "uncertain — please confirm", cls: "bg-rose-100 text-rose-800" },
  missing: { label: "not found — add if needed", cls: "bg-slate-100 text-slate-600" },
};

const STATUS_ICON: Record<ParsedDoc["status"], string> = {
  ok: "✅",
  partial: "⚠️",
  failed: "❌",
};

export default function ReviewStep({
  fields,
  setFields,
  docs,
  templateStructure,
  mode,
  busy,
  onBack,
  onGenerate,
}: {
  fields: Fields;
  setFields: (f: Fields) => void;
  docs: ParsedDoc[];
  templateStructure: TemplateStructure | null;
  mode: Mode;
  busy: boolean;
  onBack: () => void;
  onGenerate: () => void;
}) {
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const setValue = (key: (typeof FIELD_KEYS)[number], value: string) => {
    setFields({
      ...fields,
      [key]: { value, confidence: value.trim() ? "high" : "missing" },
    });
  };

  const evidenceDocs = docs.filter((d) => d.kind !== "template" && d.text.trim());

  // Ask the AI to draft a narrative field (objective, outcome, …) from the
  // uploaded documents. The result is marked "please verify".
  const suggest = async (key: (typeof FIELD_KEYS)[number]) => {
    setSuggesting(key);
    setSuggestError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestField: FIELD_LABELS[key],
          docs: evidenceDocs.map((d) => ({ name: d.name, kind: d.kind, text: d.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Suggestion failed. Please try again.");
      setFields({
        ...fields,
        [key]: { value: String(data.suggestion), confidence: "medium" },
      });
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : "Suggestion failed. Please try again.");
    } finally {
      setSuggesting(null);
    }
  };

  const uncertain = FIELD_KEYS.filter(
    (k) => fields[k].confidence === "low" || fields[k].confidence === "medium"
  ).length;

  const sections = templateStructure?.sections?.length
    ? templateStructure.sections
    : QUICK_MODE_SECTIONS;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Check the extracted details</h2>
        <p className="mt-1 text-sm text-slate-600">
          Fix mistakes, fill in anything missing, and confirm the counts before the report is
          written.{" "}
          {uncertain > 0 && (
            <span className="font-medium text-amber-700">
              {uncertain} field{uncertain > 1 ? "s" : ""} need{uncertain === 1 ? "s" : ""} your
              confirmation.
            </span>
          )}
        </p>
      </div>

      {suggestError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800">
          {suggestError}
        </div>
      )}

      {docs.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">How your files were read</h3>
          <ul className="mt-2 space-y-1.5">
            {docs.map((d, i) => (
              <li key={d.name + i} className="flex items-start gap-2 text-xs text-slate-700">
                <span>{STATUS_ICON[d.status]}</span>
                <span>
                  <span className="font-medium">{d.name}</span>
                  <span className="text-slate-400"> ({d.kind})</span> — {d.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === "template" && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Report structure to follow</h3>
          {templateStructure ? (
            <>
              {templateStructure.note && (
                <p className="mt-1 text-xs text-amber-700">{templateStructure.note}</p>
              )}
              <ol className="mt-2 list-inside list-decimal text-xs text-slate-700">
                {templateStructure.sections.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </>
          ) : (
            <p className="mt-1 text-xs text-amber-700">
              The template structure could not be understood, so the standard academic structure
              will be used instead: {QUICK_MODE_SECTIONS.join(" · ")}.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELD_KEYS.map((key) => {
          const field = fields[key];
          const badge = CONFIDENCE_BADGE[field.confidence];
          const isLong = LONG_FIELDS.includes(key);
          return (
            <div
              key={key}
              className={`rounded-xl border bg-white p-4 ${
                field.confidence === "low" || field.confidence === "medium"
                  ? "border-amber-300"
                  : "border-slate-200"
              } ${isLong ? "sm:col-span-2" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={key} className="text-xs font-semibold text-slate-900">
                  {FIELD_LABELS[key]}
                </label>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
              {isLong ? (
                <>
                  <textarea
                    id={key}
                    rows={3}
                    value={field.value}
                    onChange={(e) => setValue(key, e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  {evidenceDocs.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        onClick={() => void suggest(key)}
                        disabled={busy || suggesting !== null}
                        className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"
                      >
                        {suggesting === key ? "Drafting…" : "✨ Suggest from uploads"}
                      </button>
                      {field.value.trim() && (
                        <span className="text-[11px] text-slate-400">
                          Suggesting replaces the current text.
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <input
                  id={key}
                  type="text"
                  value={field.value}
                  onChange={(e) => setValue(key, e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          ← Back to uploads
        </button>
        <button
          onClick={onGenerate}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-40"
        >
          Generate report ({sections.length} sections) →
        </button>
      </div>
    </section>
  );
}
