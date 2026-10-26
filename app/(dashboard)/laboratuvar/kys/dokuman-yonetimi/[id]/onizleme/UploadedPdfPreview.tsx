"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./uploadedPdf.module.css";
import PdfPages from "./PdfPages";

export default function UploadedPdfPreview({ id, title, code, revision, onClose }: { id: number; title: string; code: string; revision: string; onClose?: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const modal = Boolean(onClose);
  useEffect(() => {
    if (!modal) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); close.current?.(); }
      if (event.key === "Tab") {
        const targets = panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        if (!targets?.length) return;
        const first = targets[0], last = targets[targets.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previousFocus?.focus(); };
  }, [modal]);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    setUrl("");
    setError("");
    (async () => {
      try {
        const response = await fetch(`/api/kys/dokumanlar/${id}/pdf`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "PDF önizlemesi açılamadı.");
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "PDF önizlemesi açılamadı.");
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  const content = (
    <div ref={panel} tabIndex={modal ? -1 : undefined} role={modal ? "dialog" : undefined} aria-modal={modal ? true : undefined} aria-label={modal ? `${title} PDF önizleme` : undefined} className={modal ? `${styles.viewer} ${styles.modal}` : styles.viewer}>
      <header className={styles.toolbar}>
        <div><p>{code} · Rev. {revision}</p><h1>{title}</h1></div>
        <div className={styles.actions}>
          {!modal && <Link href="/laboratuvar/kys/dokuman-yonetimi">Listeye dön</Link>}
          {url && <a href={url} download={`${code} ${title}.pdf`}>PDF indir</a>}
          {onClose && <button type="button" onClick={onClose} aria-label="PDF önizlemeyi kapat">Kapat ×</button>}
        </div>
      </header>
      {error ? <p className={styles.message} role="alert">{error}</p>
        : url ? <PdfPages url={url} title={`${code} ${title}`} />
          : <p className={styles.message} role="status">PDF önizlemesi hazırlanıyor…</p>}
    </div>
  );
  return modal ? createPortal(<div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) onClose?.(); }}>{content}</div>, document.body) : content;
}
