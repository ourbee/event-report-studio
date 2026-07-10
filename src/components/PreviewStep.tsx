"use client";

import { useState } from "react";
import type { FieldKey, Fields, PhotoItem, Report, TemplateLayout } from "@/lib/types";
import { exportDocx, downloadBlob } from "@/lib/exportDocx";
import { exportPdf } from "@/lib/exportPdf";

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "event-report"
  );
}

function AutoTextarea({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
      ref={(el) => {
        if (el) {
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }
      }}
      className={`w-full resize-none overflow-hidden bg-transparent focus:outline-none ${className ?? ""}`}
    />
  );
}

export default function PreviewStep({
  report,
  setReport,
  layout,
  fields,
  setFields,
  photos,
  setPhotos,
  busy,
  onRegenerate,
  onBackToDetails,
  onClearSession,
}: {
  report: Report;
  setReport: (r: Report) => void;
  layout: TemplateLayout;
  fields: Fields;
  setFields: (f: Fields) => void;
  photos: PhotoItem[];
  setPhotos: (p: PhotoItem[]) => void;
  busy: boolean;
  onRegenerate: (instruction?: string) => void;
  onBackToDetails: () => void;
  onClearSession: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [exporting, setExporting] = useState<"" | "docx" | "pdf">("");
  const [exportError, setExportError] = useState("");
  const [exported, setExported] = useState(false);

  const setSection = (i: number, body: string) => {
    const sections = report.sections.map((s, idx) => (idx === i ? { ...s, body } : s));
    setReport({ ...report, sections });
  };
  const setHeading = (i: number, heading: string) => {
    const sections = report.sections.map((s, idx) => (idx === i ? { ...s, heading } : s));
    setReport({ ...report, sections });
  };

  const setField = (key: FieldKey, value: string) => {
    setFields({
      ...fields,
      [key]: { value, confidence: value.trim() ? ("high" as const) : ("missing" as const) },
    });
  };
  const institution = {
    name: fields.institutionName.value,
    address: fields.institutionAddress.value,
  };

  const doExport = async (kind: "docx" | "pdf") => {
    setExportError("");
    setExporting(kind);
    try {
      const filename = slugify(report.title);
      if (kind === "docx") {
        downloadBlob(await exportDocx(report, photos, institution, layout), `${filename}.docx`);
      } else {
        downloadBlob(exportPdf(report, photos, institution, layout), `${filename}.pdf`);
      }
      setExported(true);
    } catch {
      setExportError(
        kind === "docx"
          ? "The Word file could not be created. Please try again."
          : "The PDF could not be created. Please try again."
      );
    } finally {
      setExporting("");
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Preview and edit your report</h2>
          <p className="mt-1 text-sm text-slate-600">
            Click anywhere in the document to edit it directly, then export.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void doExport("docx")}
            disabled={busy || exporting !== ""}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-800 disabled:opacity-40"
          >
            {exporting === "docx" ? "Preparing…" : "⬇ Word (.docx)"}
          </button>
          <button
            onClick={() => void doExport("pdf")}
            disabled={busy || exporting !== ""}
            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-rose-800 disabled:opacity-40"
          >
            {exporting === "pdf" ? "Preparing…" : "⬇ PDF"}
          </button>
        </div>
      </div>

      {exportError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {exportError}
        </div>
      )}

      {/* Document-style preview */}
      <div className="rounded-xl border border-slate-300 bg-white px-8 py-10 shadow-sm sm:px-12">
        {/* Institution letterhead: name large + address smaller, both centred */}
        <AutoTextarea
          value={institution.name}
          onChange={(v) => setField("institutionName", v)}
          placeholder="Name of Institution"
          className="text-center font-serif text-2xl font-bold uppercase tracking-wide text-slate-900"
        />
        <AutoTextarea
          value={institution.address}
          onChange={(v) => setField("institutionAddress", v)}
          placeholder="Address of institution"
          className="text-center font-serif text-sm text-slate-700"
        />
        <hr className="my-4 border-slate-300" />
        <AutoTextarea
          value={report.title}
          onChange={(v) => setReport({ ...report, title: v })}
          className="text-center font-serif text-xl font-bold text-slate-900"
        />
        {layout === "table" ? (
          <div className="mt-6 border-l border-t border-slate-400">
            {report.sections.map((section, i) => (
              <div key={i} className="grid grid-cols-[36%_64%]">
                <div className="border-b border-r border-slate-400 px-3 py-2">
                  <AutoTextarea
                    value={section.heading}
                    onChange={(v) => setHeading(i, v)}
                    className="font-serif text-sm font-bold text-slate-800"
                  />
                </div>
                <div className="border-b border-r border-slate-400 px-3 py-2">
                  <AutoTextarea
                    value={section.body}
                    onChange={(v) => setSection(i, v)}
                    className="font-serif text-sm leading-6 text-slate-800"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          report.sections.map((section, i) => (
            <div key={i} className="mt-6">
              <AutoTextarea
                value={section.heading}
                onChange={(v) => setHeading(i, v)}
                className="font-serif text-base font-bold text-slate-800"
              />
              <AutoTextarea
                value={section.body}
                onChange={(v) => setSection(i, v)}
                className="mt-1 text-justify font-serif text-[15px] leading-7 text-slate-800"
              />
            </div>
          ))
        )}

        {photos.length > 0 && (
          <div className="mt-8 border-t border-slate-200 pt-6">
            <h3 className="font-serif text-base font-bold text-slate-800">Photo Annexure</h3>
            <p className="mt-1 text-xs text-slate-500">
              Included at the end of the exported report. Edit the captions below.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {photos.map((p, i) => (
                <figure key={p.name + i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.dataUrl}
                    alt={p.caption || p.name}
                    className="w-full rounded-lg border border-slate-200"
                  />
                  <input
                    type="text"
                    value={p.caption}
                    placeholder="Write a short caption…"
                    onChange={(e) =>
                      setPhotos(
                        photos.map((x, idx) =>
                          idx === i ? { ...x, caption: e.target.value } : x
                        )
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-center text-xs italic text-slate-600 focus:border-indigo-400 focus:outline-none"
                  />
                </figure>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Regenerate */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Not happy with the draft?</h3>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Optional instruction, e.g. “make it more concise” or “emphasise student participation”"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={() => onRegenerate(instruction.trim() || undefined)}
            disabled={busy}
            className="rounded-lg border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
          >
            ↻ Regenerate report
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Regenerating replaces the current draft, including your manual edits.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBackToDetails}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          ← Back to extracted details
        </button>
        {exported && (
          <button
            onClick={onClearSession}
            className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            ✓ Done — clear session
          </button>
        )}
      </div>
    </section>
  );
}
