"use client";

import { useEffect } from "react";

export default function PrintToolbar({ pdfUrl, autoPrint = false }: { pdfUrl: string; autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.open(pdfUrl, "_blank", "noopener,noreferrer"), 450);
    return () => window.clearTimeout(timer);
  }, [autoPrint, pdfUrl]);

  return (
    <div className="toolbar">
      <a className="btn-pdf" href={pdfUrl}>
        PDF indir
      </a>
      <button className="btn-print" onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}>
        Yazdır
      </button>
      <button className="btn-close" onClick={() => window.close()}>
        Kapat
      </button>
    </div>
  );
}
