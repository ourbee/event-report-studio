# Event Report Studio

A no-login, privacy-first web app for academic institutions: upload event files
(notice, flyer, attendance sheet, photos), review the AI-extracted details, and
export a formal event report as an editable Word document and PDF.

Built per `mvp-specification.md` (Academic Event Report Generator MVP).

## How it works

1. **Choose a mode** — *Quick Mode* (built-in academic structure) or *Template
   Mode* (upload a past report; its section headings guide the new one).
2. **Upload files** — PDF / JPG / PNG / DOCX. Files are parsed **inside the
   browser** (pdf.js for PDFs, Tesseract OCR for images and scanned pages,
   mammoth for DOCX). The files themselves are never uploaded anywhere.
3. **Extraction** — only the extracted *text* is sent to `/api/extract`, which
   calls Groq (JSON mode) to fill the 16-field schema with per-field confidence.
4. **Review** — every field is editable; uncertain fields are flagged.
5. **Generate** — `/api/generate` writes the report following the agreed
   section structure. Regenerate with an optional instruction any time.
6. **Preview & edit** — the report renders as an editable document, with a
   photo annexure and editable captions.
7. **Export** — Word (`docx` package) and PDF (jsPDF), both generated
   client-side, both including the photo annexure.
8. **Clear session** — wipes all browser-held working data.

Draft state (fields + report text) is kept in `sessionStorage` only, so a page
refresh resumes the draft but closing the tab discards it. No database, no
accounts, no file storage.

## Local development

```bash
npm install
cp .env.example .env.local   # paste your real Groq key
npm run dev                  # http://localhost:3000
```

`predev`/`prebuild` copy the pdf.js worker into `public/`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | yes | Groq API key (free tier works) |
| `TEXT_MODEL` | no | Force a specific Groq model if the defaults are retired |

Model fallback: the server asks Groq which models are live (cached 10 min) and
uses the first available preference (`src/lib/models.ts`), so a retired model
never hard-breaks the app.

## Deploying

Push to GitHub, import the repo in Vercel, add `GROQ_API_KEY` as an environment
variable, deploy. See the project notes for step-by-step commands.

## Privacy model

- No login, no accounts, no permanent storage.
- Uploaded files are read in the browser only.
- Extracted text is processed transiently by the API route and Groq; nothing is
  persisted server-side.
- "Clear session" removes all browser-held working data.
