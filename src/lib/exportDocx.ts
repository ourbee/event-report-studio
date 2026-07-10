// Editable Word export via the docx package (client-side).

import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { PhotoItem, Report } from "./types";

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const FONT = "Times New Roman";
const BODY_SIZE = 24; // 12pt in half-points — body and headings share this size

export interface Institution {
  name: string;
  address: string;
}

export async function exportDocx(
  report: Report,
  photos: PhotoItem[],
  institution?: Institution
): Promise<Blob> {
  const children: Paragraph[] = [];

  // Letterhead: institution name (large, centred) then address (smaller, centred).
  if (institution?.name.trim()) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          new TextRun({ text: institution.name.trim(), bold: true, size: 32, font: FONT }),
        ],
      })
    );
  }
  if (institution?.address.trim()) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: institution.address.trim(), size: 22, font: FONT })],
      })
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: report.title, bold: true, size: 28, font: FONT })],
    })
  );

  for (const section of report.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({ text: section.heading, bold: true, size: BODY_SIZE, font: FONT, color: "000000" }),
        ],
      })
    );
    for (const para of section.body.split(/\n\s*\n/)) {
      const clean = para.trim();
      if (!clean) continue;
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 160, line: 320 },
          children: [new TextRun({ text: clean, size: BODY_SIZE, font: FONT })],
        })
      );
    }
  }

  if (photos.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: true,
        spacing: { after: 200 },
        children: [
          new TextRun({ text: "Photo Annexure", bold: true, size: BODY_SIZE, font: FONT, color: "000000" }),
        ],
      })
    );
    for (const photo of photos) {
      const maxW = 480; // ~6.7in printable width in px at 72dpi
      const scale = Math.min(1, maxW / photo.width);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: 60 },
          children: [
            new ImageRun({
              type: "jpg",
              data: dataUrlToUint8(photo.dataUrl),
              transformation: {
                width: Math.round(photo.width * scale),
                height: Math.round(photo.height * scale),
              },
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
          children: [
            new TextRun({ text: photo.caption || photo.name, italics: true, size: 20, font: FONT }),
          ],
        })
      );
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY_SIZE } },
      },
    },
    sections: [{ properties: {}, children }],
  });
  return Packer.toBlob(doc);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
