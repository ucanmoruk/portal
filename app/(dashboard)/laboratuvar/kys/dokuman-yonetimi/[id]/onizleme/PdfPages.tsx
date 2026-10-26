"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./uploadedPdf.module.css";

export default function PdfPages({ url, title }: { url: string; title: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cancelled = false;
    let destroy: (() => Promise<void>) | undefined;
    setError(""); setLoaded(false);
    (async () => {
      try {
        // Load PDF.js as its original browser ESM; avoid rebundling its own runtime.
        const engineUrl = "/api/kys/pdf-worker?asset=engine&v=5.4.296";
        const pdfjs: typeof import("pdfjs-dist") = await import(/* webpackIgnore: true */ engineUrl);
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/api/kys/pdf-worker?v=5.4.296";
        const task = pdfjs.getDocument({ url, isEvalSupported: false });
        destroy = () => task.destroy();
        const pdf = await task.promise;
        for (let number = 1; number <= pdf.numPages && !cancelled; number++) {
          const page = await pdf.getPage(number);
          if (cancelled) break;
          const viewport = page.getViewport({ scale: Math.min(window.devicePixelRatio || 1, 2) * 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${title} — Sayfa ${number}/${pdf.numPages}`);
          canvas.className = styles.page;
          await page.render({ canvas, viewport }).promise;
          if (!cancelled) element.append(canvas);
        }
        if (!cancelled) setLoaded(true);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "PDF sayfaları görüntülenemedi.");
      }
    })();
    return () => { cancelled = true; element.replaceChildren(); void destroy?.(); };
  }, [url, title]);
  return (
    <section className={styles.pages} aria-label="PDF sayfaları">
      {!loaded && !error && <p role="status">PDF sayfaları yükleniyor…</p>}
      {error && <p role="alert">{error}</p>}
      <div ref={container} className={styles.pageStack} />
    </section>
  );
}
