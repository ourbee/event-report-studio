// Client-side file reading. Files never leave the browser — only the
// extracted text is sent to the API for structured extraction.

import type { DocKind, ParsedDoc, PhotoItem } from "./types";

export const ACCEPTED_DOC_TYPES = ".pdf,.jpg,.jpeg,.png,.docx";
export const MAX_FILE_MB = 15;

const MIN_PDF_TEXT_CHARS = 40; // below this per page, assume a scanned page
const MAX_OCR_PAGES = 5;
const MAX_PDF_PAGES = 15;

// ---------- pdf.js (lazy, browser-only) ----------

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

async function getPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// ---------- tesseract.js (lazy, shared worker) ----------

type TesseractWorker = import("tesseract.js").Worker;
let ocrWorkerPromise: Promise<TesseractWorker> | null = null;

async function getOcrWorker(): Promise<TesseractWorker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = import("tesseract.js").then((t) => t.createWorker("eng"));
  }
  return ocrWorkerPromise;
}

export async function disposeOcrWorker() {
  if (ocrWorkerPromise) {
    try {
      (await ocrWorkerPromise).terminate();
    } catch {
      // already gone
    }
    ocrWorkerPromise = null;
  }
}

async function ocrImageSource(src: Blob | HTMLCanvasElement): Promise<string> {
  const worker = await getOcrWorker();
  const input = src instanceof Blob ? src : src.toDataURL("image/png");
  const { data } = await worker.recognize(input);
  return (data.text ?? "").trim();
}

// ---------- per-type readers ----------

async function readPdf(
  file: File,
  onStatus: (s: string) => void
): Promise<{ text: string; status: ParsedDoc["status"]; note: string }> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
  let text = "";
  let ocrPagesUsed = 0;
  let ocrFailed = false;

  for (let i = 1; i <= pageCount; i++) {
    onStatus(`Reading ${file.name} — page ${i} of ${pageCount}…`);
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let pageText = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // Scanned page fallback: render to canvas and OCR.
    if (pageText.length < MIN_PDF_TEXT_CHARS && ocrPagesUsed < MAX_OCR_PAGES) {
      try {
        onStatus(`Running OCR on ${file.name} — page ${i} (scanned page)…`);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const ocrText = await ocrImageSource(canvas);
        if (ocrText.length > pageText.length) pageText = ocrText;
        ocrPagesUsed++;
      } catch {
        ocrFailed = true;
      }
    }
    if (pageText) text += pageText + "\n\n";
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return {
      text: "",
      status: "failed",
      note: "This file could not be read clearly. It may be a blurry or image-only scan.",
    };
  }
  let note = "Read successfully.";
  if (ocrPagesUsed > 0) note = `Read with OCR on ${ocrPagesUsed} scanned page(s).`;
  if (doc.numPages > MAX_PDF_PAGES) note += ` Only the first ${MAX_PDF_PAGES} pages were read.`;
  return { text: trimmed, status: ocrFailed ? "partial" : "ok", note };
}

async function readImage(
  file: File,
  onStatus: (s: string) => void
): Promise<{ text: string; status: ParsedDoc["status"]; note: string }> {
  onStatus(`Running OCR on ${file.name}…`);
  try {
    const text = await ocrImageSource(file);
    if (text.length < 10) {
      return {
        text,
        status: "partial",
        note: "Very little text was detected in this image. If it contains important details, please add them manually on the review screen.",
      };
    }
    return { text, status: "ok", note: "Read via OCR." };
  } catch {
    return { text: "", status: "failed", note: "OCR failed for this image." };
  }
}

async function readDocx(
  file: File,
  onStatus: (s: string) => void
): Promise<{ text: string; status: ParsedDoc["status"]; note: string }> {
  onStatus(`Reading ${file.name}…`);
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const text = (result.value ?? "").trim();
    if (!text) return { text: "", status: "failed", note: "No text found in this document." };
    return { text, status: "ok", note: "Read successfully." };
  } catch {
    return { text: "", status: "failed", note: "This Word file could not be read." };
  }
}

// ---------- public API ----------

export function fileExt(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1).toLowerCase();
}

export async function parseFile(
  file: File,
  kind: DocKind,
  onStatus: (s: string) => void
): Promise<ParsedDoc> {
  const base: Omit<ParsedDoc, "text" | "status" | "note"> = { name: file.name, kind };

  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return { ...base, text: "", status: "failed", note: `File is larger than ${MAX_FILE_MB} MB.` };
  }

  const ext = fileExt(file.name);
  try {
    if (ext === "pdf") return { ...base, ...(await readPdf(file, onStatus)) };
    if (ext === "jpg" || ext === "jpeg" || ext === "png")
      return { ...base, ...(await readImage(file, onStatus)) };
    if (ext === "docx") return { ...base, ...(await readDocx(file, onStatus)) };
    return { ...base, text: "", status: "failed", note: "Unsupported file type." };
  } catch {
    return { ...base, text: "", status: "failed", note: "This file could not be read clearly." };
  }
}

// Downscale a photo to a JPEG data URL for preview + export annexure.
export async function preparePhoto(file: File): Promise<PhotoItem> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode failed"));
    el.src = dataUrl;
  });

  const MAX_DIM = 1200;
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);

  return {
    name: file.name,
    dataUrl: canvas.toDataURL("image/jpeg", 0.82),
    caption: "",
    width,
    height,
  };
}
