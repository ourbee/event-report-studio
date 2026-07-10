"use client";

import { useState, type ReactNode } from "react";
import {
  emptyFields,
  QUICK_MODE_SECTIONS,
  type DocKind,
  type Fields,
  type Mode,
  type ParsedDoc,
  type PhotoItem,
  type TemplateStructure,
  type UploadFile,
} from "@/lib/types";
import { ACCEPTED_DOC_TYPES, MAX_FILE_MB, fileExt, parseFile, preparePhoto } from "@/lib/parse";

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

const DOC_EXTS = ["pdf", "jpg", "jpeg", "png", "docx"];
const PHOTO_EXTS = ["jpg", "jpeg", "png"];

// A drag-and-drop target wrapping each upload card. The file input inside it
// keeps working as before; dropping files anywhere on the card also works.
function DropZone({
  onFiles,
  disabled,
  className,
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        const dropped = Array.from(e.dataTransfer.files ?? []);
        if (dropped.length > 0) onFiles(dropped);
      }}
      className={`${className ?? ""} transition ${
        over ? "ring-2 ring-indigo-400 ring-offset-1" : ""
      }`}
    >
      {children}
    </div>
  );
}

// Barebones page mock so the user can see how the detected template will be
// laid out before proceeding.
function TemplateSkeleton({ structure }: { structure: TemplateStructure }) {
  return (
    <div className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
      <div className="mx-auto h-2.5 w-3/4 rounded bg-slate-400" title="Institution name" />
      <div className="mx-auto mt-1.5 h-1.5 w-1/2 rounded bg-slate-300" title="Institution address" />
      <div className="mx-auto mt-3 h-2 w-2/3 rounded bg-slate-300" title="Report title" />
      {structure.sections.map((s, i) => (
        <div key={s + i} className="mt-3">
          <p className="truncate font-serif text-[10px] font-bold leading-tight text-slate-700">
            {s}
          </p>
          <div className="mt-1 h-1 w-full rounded bg-slate-200" />
          <div className="mt-0.5 h-1 w-11/12 rounded bg-slate-200" />
          <div className="mt-0.5 h-1 w-4/5 rounded bg-slate-200" />
        </div>
      ))}
      {structure.hasSignatureBlock && (
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="h-1 w-16 rounded bg-slate-300" />
            <p className="mt-0.5 text-[8px] text-slate-400">Signature</p>
          </div>
          <div>
            <div className="h-1 w-16 rounded bg-slate-300" />
            <p className="mt-0.5 text-[8px] text-slate-400">Signature</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UploadStep({
  mode,
  busy,
  files,
  setFiles,
  templateDoc,
  setTemplateDoc,
  templateStructure,
  setTemplateStructure,
  photos,
  setPhotos,
  setBusy,
  setError,
  onExtracted,
  onBack,
}: {
  mode: Mode;
  busy: boolean;
  files: UploadFile[];
  setFiles: (f: UploadFile[]) => void;
  templateDoc: ParsedDoc | null;
  setTemplateDoc: (d: ParsedDoc | null) => void;
  templateStructure: TemplateStructure | null;
  setTemplateStructure: (t: TemplateStructure | null) => void;
  photos: PhotoItem[];
  setPhotos: (p: PhotoItem[]) => void;
  setBusy: (s: string | null) => void;
  setError: (s: string | null) => void;
  onExtracted: (docs: ParsedDoc[], fields: Fields, structure: TemplateStructure | null) => void;
  onBack: () => void;
}) {
  const filterByExt = (list: File[], exts: string[]): File[] => {
    const ok = list.filter((f) => exts.includes(fileExt(f.name)));
    if (ok.length < list.length) {
      setError(`Some files were skipped — supported types: ${exts.join(", ").toUpperCase()}.`);
    }
    return ok;
  };

  const addFiles = (kind: DocKind, list: File[]) => {
    const accepted = filterByExt(list, DOC_EXTS);
    const next = [...files];
    for (const f of accepted) {
      if (!next.some((x) => x.kind === kind && x.file.name === f.name && x.file.size === f.size)) {
        next.push({ file: f, kind });
      }
    }
    setFiles(next);
  };

  const addPhotos = async (list: File[]) => {
    setError(null);
    const accepted = filterByExt(list, PHOTO_EXTS);
    const additions: PhotoItem[] = [];
    for (const f of accepted.slice(0, 10 - photos.length)) {
      try {
        additions.push(await preparePhoto(f));
      } catch {
        setError(`The photo “${f.name}” could not be read.`);
      }
    }
    setPhotos([...photos, ...additions]);
  };

  const removeFile = (i: number) => setFiles(files.filter((_, idx) => idx !== i));

  // Read the template immediately on upload and show the detected structure
  // so the user can confirm/correct it before uploading evidence files.
  const handleTemplate = async (list: File[]) => {
    const file = filterByExt(list, DOC_EXTS)[0];
    if (!file) return;
    setError(null);
    setTemplateStructure(null);
    setBusy(`Reading template ${file.name}…`);
    try {
      const parsed = await parseFile(file, "template", setBusy);
      setTemplateDoc(parsed);
      if (!parsed.text.trim()) {
        setError(
          "The template could not be read clearly, so the standard structure will be used. You can still edit the section list below."
        );
        setTemplateStructure({
          sections: [...QUICK_MODE_SECTIONS],
          hasSignatureBlock: false,
          note: "Template unreadable — standard structure shown instead. Edit it to match your format.",
        });
        return;
      }
      setBusy("Detecting the template's sections…");
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structureOnly: true,
          docs: [{ name: parsed.name, kind: "template", text: parsed.text }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Template reading failed. Please try again.");
      if (data.templateStructure?.sections?.length) {
        setTemplateStructure(data.templateStructure as TemplateStructure);
      } else {
        setTemplateStructure({
          sections: [...QUICK_MODE_SECTIONS],
          hasSignatureBlock: false,
          note: "No clear section headings were detected — standard structure shown instead. Edit it to match your format.",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The template could not be processed.");
    } finally {
      setBusy(null);
    }
  };

  const setSections = (sections: string[]) => {
    if (!templateStructure) return;
    setTemplateStructure({ ...templateStructure, sections });
  };
  const moveSection = (i: number, dir: -1 | 1) => {
    if (!templateStructure) return;
    const next = [...templateStructure.sections];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next);
  };

  const canProcess =
    files.length > 0 && (mode === "quick" || templateDoc !== null) && !busy;

  const process = async () => {
    setError(null);

    try {
      // Parse evidence files, reusing cached results after a back-navigation.
      const updated: UploadFile[] = [];
      const parsed: ParsedDoc[] = templateDoc ? [templateDoc] : [];
      for (const entry of files) {
        const doc = entry.parsed ?? (await parseFile(entry.file, entry.kind, setBusy));
        updated.push({ ...entry, parsed: doc });
        parsed.push(doc);
      }
      setFiles(updated);

      const readable = parsed.filter((d) => d.kind !== "template" && d.text.trim());
      if (readable.length === 0) {
        setBusy(null);
        setError(
          "None of the uploaded files could be read clearly. Please try clearer scans or add the details manually after uploading at least one readable file."
        );
        return;
      }

      setBusy("Extracting event details with AI…");
      // The template's structure was already detected (and possibly edited by
      // the user) at upload time, so only the evidence files are sent here.
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docs: readable.map((d) => ({ name: d.name, kind: d.kind, text: d.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Extraction failed. Please try again.");

      onExtracted(parsed, { ...emptyFields(), ...data.fields }, templateStructure);
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
          Supported: PDF, JPG, PNG, DOCX. Max {MAX_FILE_MB} MB per file. Choose files or drag
          &amp; drop them onto any box below. Files are read inside your browser and are not
          stored anywhere.
        </p>
      </div>

      {mode === "template" && (
        <DropZone
          onFiles={(f) => void handleTemplate(f)}
          disabled={busy}
          className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-5"
        >
          <h3 className="text-sm font-semibold text-slate-900">
            Template / sample report <span className="text-rose-600">*</span>
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            A past report or format from your institution. Its section headings and order will
            guide the new report. Drop it here or choose a file.
          </p>
          <input
            type="file"
            accept={ACCEPTED_DOC_TYPES}
            className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
            onChange={(e) => {
              void handleTemplate(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          {templateDoc && (
            <p className="mt-2 text-xs font-medium text-emerald-700">✓ {templateDoc.name}</p>
          )}

          {templateDoc && templateStructure && (
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px]">
              <div>
                <h4 className="text-xs font-semibold text-slate-900">
                  Sections detected in your template — check and correct them
                </h4>
                {templateStructure.note && (
                  <p className="mt-1 text-xs text-amber-700">{templateStructure.note}</p>
                )}
                <ul className="mt-2 space-y-1.5">
                  {templateStructure.sections.map((s, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="w-5 text-right text-xs text-slate-400">{i + 1}.</span>
                      <input
                        type="text"
                        value={s}
                        onChange={(e) => {
                          const next = [...templateStructure.sections];
                          next[i] = e.target.value;
                          setSections(next);
                        }}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        onClick={() => moveSection(i, -1)}
                        disabled={i === 0}
                        className="rounded px-1 text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                        aria-label={`Move ${s} up`}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveSection(i, 1)}
                        disabled={i === templateStructure.sections.length - 1}
                        className="rounded px-1 text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                        aria-label={`Move ${s} down`}
                      >
                        ↓
                      </button>
                      <button
                        onClick={() =>
                          setSections(templateStructure.sections.filter((_, idx) => idx !== i))
                        }
                        className="rounded px-1 text-xs text-rose-500 hover:bg-rose-100"
                        aria-label={`Remove ${s}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setSections([...templateStructure.sections, "New section"])}
                  className="mt-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                >
                  + Add section
                </button>
                {templateStructure.hasSignatureBlock && (
                  <p className="mt-2 text-xs text-slate-500">
                    ✍️ A signature block was detected at the end of the template.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1 text-center text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Layout preview
                </p>
                <TemplateSkeleton structure={templateStructure} />
              </div>
            </div>
          )}
        </DropZone>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {DOC_SLOTS.map((slot) => {
          const slotFiles = files.filter((f) => f.kind === slot.kind);
          return (
            <DropZone
              key={slot.kind}
              onFiles={(f) => addFiles(slot.kind, f)}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <h3 className="text-sm font-semibold text-slate-900">{slot.label}</h3>
              <p className="mt-1 text-xs text-slate-500">{slot.hint}</p>
              <input
                type="file"
                accept={slot.accept}
                multiple={slot.multiple}
                className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-700"
                onChange={(e) => {
                  addFiles(slot.kind, Array.from(e.target.files ?? []));
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
            </DropZone>
          );
        })}
      </div>

      <DropZone
        onFiles={(f) => void addPhotos(f)}
        disabled={busy}
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
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
            void addPhotos(Array.from(e.target.files ?? []));
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
      </DropZone>

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
      {mode === "template" && !templateDoc && files.length > 0 && (
        <p className="text-right text-xs text-amber-700">
          Template Mode needs a template or sample report before processing.
        </p>
      )}
    </section>
  );
}
