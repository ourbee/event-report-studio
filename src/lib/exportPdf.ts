// PDF export via jsPDF (client-side), with a photo annexure.

import { jsPDF } from "jspdf";
import type { PhotoItem, Report } from "./types";

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;

export interface Institution {
  name: string;
  address: string;
}

export function exportPdf(report: Report, photos: PhotoItem[], institution?: Institution): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  const ensureRoom = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // Letterhead: institution name (large, centred) then address (smaller, centred).
  if (institution?.name.trim()) {
    doc.setFont("times", "bold");
    doc.setFontSize(16);
    const nameLines: string[] = doc.splitTextToSize(institution.name.trim(), CONTENT_W);
    for (const line of nameLines) {
      ensureRoom(8);
      doc.text(line, PAGE_W / 2, y, { align: "center" });
      y += 8;
    }
  }
  if (institution?.address.trim()) {
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    const addrLines: string[] = doc.splitTextToSize(institution.address.trim(), CONTENT_W);
    for (const line of addrLines) {
      ensureRoom(6);
      doc.text(line, PAGE_W / 2, y, { align: "center" });
      y += 6;
    }
    y += 4;
  }

  // Title
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  const titleLines: string[] = doc.splitTextToSize(report.title, CONTENT_W);
  for (const line of titleLines) {
    ensureRoom(8);
    doc.text(line, PAGE_W / 2, y, { align: "center" });
    y += 8;
  }
  y += 4;

  // Sections — body is Times 12; headings are the same size, bold.
  for (const section of report.sections) {
    ensureRoom(14);
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.text(section.heading, MARGIN, y);
    y += 7;

    doc.setFont("times", "normal");
    doc.setFontSize(12);
    for (const para of section.body.split(/\n\s*\n/)) {
      const clean = para.trim();
      if (!clean) continue;
      const lines: string[] = doc.splitTextToSize(clean, CONTENT_W);
      for (const line of lines) {
        ensureRoom(6);
        doc.text(line, MARGIN, y);
        y += 6;
      }
      y += 3;
    }
    y += 3;
  }

  // Photo annexure
  if (photos.length > 0) {
    doc.addPage();
    y = MARGIN;
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.text("Photo Annexure", MARGIN, y);
    y += 10;

    for (const photo of photos) {
      const maxW = CONTENT_W;
      const maxH = 110;
      const scale = Math.min(maxW / photo.width, maxH / photo.height);
      const w = photo.width * scale;
      const h = photo.height * scale;
      ensureRoom(h + 14);
      try {
        doc.addImage(photo.dataUrl, "JPEG", (PAGE_W - w) / 2, y, w, h);
        y += h + 5;
      } catch {
        // Skip an image that jsPDF cannot decode; keep the caption.
      }
      doc.setFont("times", "italic");
      doc.setFontSize(10);
      const cap: string[] = doc.splitTextToSize(photo.caption || photo.name, CONTENT_W);
      for (const line of cap) {
        ensureRoom(5);
        doc.text(line, PAGE_W / 2, y, { align: "center" });
        y += 5;
      }
      y += 8;
    }
  }

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.text(`Page ${i} of ${pages}`, PAGE_W / 2, PAGE_H - 10, { align: "center" });
  }

  return doc.output("blob");
}
