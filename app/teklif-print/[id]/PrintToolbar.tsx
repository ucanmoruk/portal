"use client";

import { useEffect } from "react";

export default function PrintToolbar({ pdfUrl, autoPrint = false }: { pdfUrl: string; autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="toolbar">
      <a className="btn-pdf" href={pdfUrl}>
        PDF indir
      </a>
      <button className="btn-print" onClick={() => window.print()}>
        Yazdır
      </button>
      <button className="btn-close" onClick={() => window.close()}>
        Kapat
      </button>
    </div>
  );
}
