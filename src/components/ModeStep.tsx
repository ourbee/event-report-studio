/*
 * Copyright © 2026 Ritwik Balo. All rights reserved.
 * https://github.com/ourbee
 */

"use client";

import type { Mode } from "@/lib/types";

export default function ModeStep({ onChoose }: { onChoose: (mode: Mode) => void }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">How would you like to start?</h2>
      <p className="mt-1 text-sm text-slate-600">
        Both modes read your event files, let you check the extracted details, and export the
        final report to Word and PDF.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => onChoose("quick")}
          className="rounded-xl border-2 border-slate-200 bg-white p-6 text-left transition hover:border-indigo-400 hover:shadow-md"
        >
          <div className="text-2xl">⚡</div>
          <h3 className="mt-3 text-base font-semibold text-slate-900">Quick Mode</h3>
          <p className="mt-1 text-sm text-slate-600">
            No template needed. Uses a clean, standard academic report structure — introduction,
            objective, event details, proceedings, participation, outcome, conclusion.
          </p>
          <p className="mt-3 text-sm font-medium text-indigo-600">Start in Quick Mode →</p>
        </button>

        <button
          onClick={() => onChoose("template")}
          className="rounded-xl border-2 border-slate-200 bg-white p-6 text-left transition hover:border-indigo-400 hover:shadow-md"
        >
          <div className="text-2xl">📄</div>
          <h3 className="mt-3 text-base font-semibold text-slate-900">Template Mode</h3>
          <p className="mt-1 text-sm text-slate-600">
            Upload a past report or sample format from your institution. The new report follows
            its section headings and order — used as a structural guide, not a pixel-perfect
            clone.
          </p>
          <p className="mt-3 text-sm font-medium text-indigo-600">Start in Template Mode →</p>
        </button>
      </div>
    </section>
  );
}
