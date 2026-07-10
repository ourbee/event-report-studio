import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Event Report Studio",
  description:
    "Generate formal academic event reports from your event files — no login, no storage, export to Word and PDF.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
