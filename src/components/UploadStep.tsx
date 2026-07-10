"use client";

import { useState } from "react";
import {
  emptyFields,
  type DocKind,
  type Fields,
  type Mode,
  type ParsedDoc,
  type PhotoItem,
  type TemplateStructure,
} from "@/lib/types";
import { ACCEPTED_DOC_TYPES, MAX_FILE_MB, parseFile, preparePhoto } from "@/lib/parse";

interface Slot {
  kind: DocKind;
  label: string;
  hint: string;
  accept: string;
  multiple: boolean;
}

const DOC_SLOTS: Slot[] = [
  {
    kind: "notice",
    label: "Event notice / circular",
    hint: "The official notice or circular announcing the event (PDF or image).",
    accept: ACCEPTED_DOC_TYPES,
    multiple: true,
  },
  {
    kind: "flyer",
    label: "Event flyer / poster",
    hint: "The flyer or poster, if any (PDF or image).",
    accept: ACCEPTED_DOC_TYPES,
    multiple: true,
  },
  {
    kind: "attendance",
    label: "Attendance report",
    hint: "Attendance sheet or participation summary (PDF or image).",
    accept: ACCEPTED_DOC_TYPES,
    multiple: true,
  },
  {
    kind: "other",
    label: "Other supporting files",
    hint: "Any other useful document — programme schedule, feedback summary, etc.",
    accept: ACCEPTED_DOC_TYPES,
    multiple: true,
  },
];

export default function UploadStep({
  mode,
  busy,
  photos,
  setPhotos,
  setBusy,
  setError,
  onExtracted,
  onBack,
}: {
  mode: Mode;
  busy: boolean;
  photos: PhotoItem[];
  setPhotos: (p: PhotoItem[]) => void;
  setBusy: (s: string | null) => void;
  setError: (s: string | null) => void;
  onExtracted: (docs: ParsedDoc[], fields: Fields, structure: TemplateStructure | null) => void;
  onBack: () => void;
}) {
  const [files, setFiles] = useState<{ file: File; kind: DocKind }[]>([]);
  const [templateFile, setTemplateFile] = useState<File | null>(null);

  const addFiles = (kind: DocKind, list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!next.some((x) => x.kind === kind && x.file.name === f.name && x.file.size === f.size)) {
        next.push({ file: f, kind });
      }
    }
    setFiles(next);
  };

  const addPhotos = async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const additions: PhotoItem[] = [];
    for (const f of Array.from(list).slice(0, 10 - photos.length)) {
      try {
        additions.push(await preparePhoto(f));
      } catch {
        setError(`The photo “${f.name}” could not be read.`);
      }
    }
    setPhotos([...photos, ...additions]);
  };

  const removeFile = (i: number) => setFiles(files.filter((_, idx) => idx !== i));

  const canProcess =
    files.length > 0 && (mode === "quick" || templateFile !== null) && !busy;

  const process = async () => {
    setError(null);
    const parsed: ParsedDoc[] = [];

    try {
      if (mode === "template" && templateFile) {
        parsed.push(await parseFile(templateFile, "template", setBusy));
      }
      for (const { file, kind } of files) {
        parsed.push(await parseFile(file, kind, setBusy));
      }

      const readable = parsed.filter((d) => d.kind !== "template" && d.text.trim());
      if (readable.length === 0) {
        setBusy(null);
        setError(
          "None of the uploaded files could be read clearly. Please try clearer scans or add the details manually after uploading at least one readable file."
        );
        return;
      }

      setBusy("Extracting event details with AI…");
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docs: parsed
            .filter((d) => d.text.trim())
            .map((d) => ({ name: d.name, kind: d.kind, text: d.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Extraction failed. Please try again.");

      onExtracted(parsed, { ...emptyFields(), ...data.fields }, data.templateStructure ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong while reading the files.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Upload your event files</h2>
        <p className="mt-1 text-sm text-slate-600">
          Supported: PDF, JPG, PNG{mode === "template" ? ", DOCX (template)" : ", DOCX"}. Max{" "}
          {MAX_FILE_MB} MB per file. Files are read inside your browser and are not stored
          anywhere.
        </p>
      </div>

      {mode === "template" && (
        <div className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            Template / sample report <span className="text-rose-600">*</span>
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            A past report or format from your institution. Its section headings and order will
            guide the new report.
          </p>
          <input
            type="file"
            accept={ACCEPTED_DOC_TYPES}
            className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
            onChange={(e) => setTemplateFile(e.target.files?.[0] ?? null)}
          />
          {templateFile && (
            <p className="mt-2 text-xs font-medium text-emerald-700">✓ {templateFile.name}</p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {DOC_SLOTS.map((slot) => {
          const slotFiles = files.filter((f) => f.kind === slot.kind);
          return (
            <div key={slot.kind} className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">{slot.label}</h3>
              <p className="mt-1 text-xs text-slate-500">{slot.hint}</p>
              <input
                type="file"
                accept={slot.accept}
                multiple={slot.multiple}
                className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-700"
                onChange={(e) => {
                  addFiles(slot.kind, e.target.files);
                  e.target.value = "";
                }}
              />
              {slotFiles.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {slotFiles.map((f) => (
                    <li
                      key={f.file.name + f.file.size}
                      className="flex items-center justify-between gap-2 text-xs text-slate-700"
                    >
                      <span className="truncate">📎 {f.file.name}</span>
                      <button
                        onClick={() => removeFile(files.indexOf(f))}
                        className="text-rose-500 hover:text-rose-700"
                        aria-label={`Remove ${f.file.name}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Photographs (optional)</h3>
        <p className="mt-1 text-xs text-slate-500">
          Up to 10 event photos. They are added to the report as a photo annexure with captions
          you can edit before export.
        </p>
        <input
          type="file"
          accept=".jpg,.jpeg,.png"
          multiple
          className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-700"
          onChange={(e) => {
            void addPhotos(e.target.files);
            e.target.value = "";
          }}
        />
        {photos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={p.name + i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.dataUrl}
                  alt={p.name}
                  className="h-20 w-28 rounded-lg border border-slate-200 object-cover"
                />
                <button
                  onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-xs text-white"
                  aria-label={`Remove ${p.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          onClick={() => void process()}
          disabled={!canProcess}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Read files &amp; extract details →
        </button>
      </div>
      {mode === "template" && !templateFile && files.length > 0 && (
        <p className="text-right text-xs text-amber-700">
          Template Mode needs a template or sample report before processing.
        </p>
      )}
    </section>
  );
}
