"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyFields,
  QUICK_MODE_SECTIONS,
  type Fields,
  type Mode,
  type ParsedDoc,
  type PhotoItem,
  type Report,
  type TemplateStructure,
  type UploadFile,
} from "@/lib/types";
import { disposeOcrWorker } from "@/lib/parse";
import ModeStep from "@/components/ModeStep";
import UploadStep from "@/components/UploadStep";
import ReviewStep from "@/components/ReviewStep";
import PreviewStep from "@/components/PreviewStep";

type Step = "mode" | "upload" | "review" | "preview";

const STORAGE_KEY = "event-report-studio-session";
const STEPS: { id: Step; label: string }[] = [
  { id: "mode", label: "Mode" },
  { id: "upload", label: "Upload" },
  { id: "review", label: "Review details" },
  { id: "preview", label: "Report" },
];

interface Session {
  step: Step;
  mode: Mode;
  fields: Fields;
  templateStructure: TemplateStructure | null;
  report: Report | null;
}

export default function Home() {
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<Mode>("quick");
  const [docs, setDocs] = useState<ParsedDoc[]>([]);
  // Uploads live here (not inside the upload step) so going back and forth
  // between steps never loses them; only "Clear session" or closing the tab does.
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [templateDoc, setTemplateDoc] = useState<ParsedDoc | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [templateStructure, setTemplateStructure] = useState<TemplateStructure | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // status line while working
  const [error, setError] = useState<string | null>(null);
  const restored = useRef(false);

  // Restore a session draft (browser-only convenience, spec §18).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Session;
        if (s && s.step) {
          setMode(s.mode ?? "quick");
          setFields({ ...emptyFields(), ...s.fields });
          setTemplateStructure(s.templateStructure ?? null);
          setReport(s.report ?? null);
          // Uploaded files themselves are never stored; resume at review/preview only.
          setStep(s.step === "preview" && s.report ? "preview" : s.step === "review" ? "review" : "mode");
        }
      }
    } catch {
      // ignore a corrupt draft
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      const s: Session = { step, mode, fields, templateStructure, report };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // storage full — the draft simply won't survive a refresh
    }
  }, [step, mode, fields, templateStructure, report]);

  const clearSession = useCallback(() => {
    if (!confirm("Clear this session? All uploaded files, extracted details and the draft report will be removed.")) return;
    sessionStorage.removeItem(STORAGE_KEY);
    setStep("mode");
    setMode("quick");
    setDocs([]);
    setFiles([]);
    setTemplateDoc(null);
    setPhotos([]);
    setFields(emptyFields());
    setTemplateStructure(null);
    setReport(null);
    setError(null);
    setBusy(null);
    void disposeOcrWorker();
  }, []);

  const sections = templateStructure?.sections?.length
    ? templateStructure.sections
    : QUICK_MODE_SECTIONS;

  const generate = useCallback(
    async (instruction?: string) => {
      setError(null);
      setBusy("Writing the report draft…");
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields,
            sections,
            photoCaptions: photos.map((p) => p.caption).filter(Boolean),
            instruction,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Generation failed. Please try again.");
        setReport(data.report as Report);
        setStep("preview");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Generation failed. Please try again.");
      } finally {
        setBusy(null);
      }
    },
    [fields, sections, photos]
  );

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Event Report Studio
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Turn event notices, flyers, attendance sheets and photos into a formal academic
              event report — exported to Word and PDF.
            </p>
          </div>
          <button
            onClick={clearSession}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Clear session
          </button>
        </div>

        <ol className="mt-6 flex items-center gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  i < stepIndex
                    ? "bg-emerald-600 text-white"
                    : i === stepIndex
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-200 text-slate-500"
                }`}
              >
                {i + 1}
              </span>
              <span className={i === stepIndex ? "font-medium text-slate-900" : "text-slate-500"}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 text-slate-300">—</span>}
            </li>
          ))}
        </ol>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {busy && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          {busy}
        </div>
      )}

      {step === "mode" && (
        <ModeStep
          onChoose={(m) => {
            setMode(m);
            setStep("upload");
            setError(null);
          }}
        />
      )}

      {step === "upload" && (
        <UploadStep
          mode={mode}
          busy={busy !== null}
          files={files}
          setFiles={setFiles}
          templateDoc={templateDoc}
          setTemplateDoc={setTemplateDoc}
          templateStructure={templateStructure}
          setTemplateStructure={setTemplateStructure}
          photos={photos}
          setPhotos={setPhotos}
          setBusy={setBusy}
          setError={setError}
          onExtracted={(parsedDocs, extractedFields, structure) => {
            setDocs(parsedDocs);
            setFields(extractedFields);
            setTemplateStructure(structure);
            setStep("review");
          }}
          onBack={() => setStep("mode")}
        />
      )}

      {step === "review" && (
        <ReviewStep
          fields={fields}
          setFields={setFields}
          docs={docs}
          templateStructure={mode === "template" ? templateStructure : null}
          mode={mode}
          busy={busy !== null}
          onBack={() => setStep("upload")}
          onGenerate={() => void generate()}
        />
      )}

      {step === "preview" && report && (
        <PreviewStep
          report={report}
          setReport={setReport}
          fields={fields}
          setFields={setFields}
          photos={photos}
          setPhotos={setPhotos}
          busy={busy !== null}
          onRegenerate={(instruction) => void generate(instruction)}
          onBackToDetails={() => setStep("review")}
          onClearSession={clearSession}
        />
      )}

      <footer className="mt-12 border-t border-slate-200 pt-4 text-xs text-slate-500">
        <p>
          <strong>Privacy:</strong> No login, no account, no permanent storage. Your files are
          read inside your browser; only the extracted text is sent for AI processing and is not
          retained. Draft work lives only in this browser tab — export your report before closing,
          and use “Clear session” when you are done.
        </p>
        <p className="mt-3">
          Created by{" "}
          <a
            href="https://github.com/ourbee"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 underline hover:text-indigo-800"
          >
            Ritwik Balo
          </a>
        </p>
      </footer>
    </main>
  );
}
