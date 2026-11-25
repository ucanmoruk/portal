"use client";

import { useEffect, useState } from "react";

export default function PrintToolbar({ pdfUrl, autoPrint = false }: { pdfUrl: string; autoPrint?: boolean }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    setError("");
    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "PDF indirilemedi.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const encodedName = response.headers.get("content-disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      link.href = url;
      link.download = encodedName ? decodeURIComponent(encodedName) : "Teklif.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF indirilemedi.");
    } finally {
      setDownloading(false);
    }
  }
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.open(pdfUrl, "_blank", "noopener,noreferrer"), 450);
    return () => window.clearTimeout(timer);
  }, [autoPrint, pdfUrl]);

  return (
    <div className="toolbar">
      <button className="btn-pdf" onClick={downloadPdf} disabled={downloading} aria-busy={downloading}>
        {downloading ? "PDF hazırlanıyor…" : "PDF indir"}
      </button>
      {error && <span role="alert" style={{ color: "#fff" }}>{error}</span>}
      <button className="btn-print" onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}>
        Yazdır
      </button>
      <button className="btn-close" onClick={() => window.close()}>
        Kapat
      </button>
    </div>
  );
}
