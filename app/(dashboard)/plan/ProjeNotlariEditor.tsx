"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./proje-notlari.module.css";

export default function ProjeNotlariEditor() {
  const [text, setText]       = useState("");
  const [loaded, setLoaded]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [dirty, setDirty]     = useState(false);
  const [status, setStatus]   = useState<"idle" | "ok" | "err">("idle");
  const [errMsg, setErrMsg]   = useState("");
  const lastSaved = useRef("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/proje-notlari");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Yüklenemedi");
        if (cancelled) return;
        const t = typeof data.text === "string" ? data.text : "";
        setText(t);
        lastSaved.current = t;
        setLoaded(true);
      } catch (e: unknown) {
        if (cancelled) return;
        setLoaded(true);
        setStatus("err");
        setErrMsg(e instanceof Error ? e.message : "Yüklenemedi");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setStatus("idle");
    setErrMsg("");
    try {
      const res = await fetch("/api/proje-notlari", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kaydedilemedi");
      lastSaved.current = text;
      setDirty(false);
      setStatus("ok");
    } catch (e: unknown) {
      setStatus("err");
      setErrMsg(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }, [text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (loaded && !saving) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loaded, saving, save]);

  useEffect(() => {
    if (!loaded) return;
    setDirty(text !== lastSaved.current);
  }, [text, loaded]);

  return (
    <div className={styles.panel}>
      <p className={styles.hint}>
        Aşağıya öncelikleri, maddeleri ve bağlamı yazın; sohbette &quot;proje notlarına göre devam et&quot; veya dosya yolunu
        vererek ilerletebilirsiniz. Kayıt diske yazılır — aynı metni Cursor’da da açıp düzenleyebilirsiniz.
        <span className={styles.path}>data/proje-notlari.md</span>
      </p>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => void save()}
          disabled={!loaded || saving || !dirty}
        >
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <span className={styles.status}>
          {!loaded && "Yükleniyor…"}
          {loaded && status === "idle" && dirty && "Kaydedilmemiş değişiklik"}
          {loaded && status === "idle" && !dirty && "Diske yazıldı"}
          {status === "ok" && <span className={styles.statusOk}>Kaydedildi</span>}
          {status === "err" && <span className={styles.statusErr}>{errMsg}</span>}
        </span>
        <span className={styles.status} style={{ marginLeft: "auto" }}>
          Ctrl+S / ⌘S — kaydet
        </span>
      </div>

      <textarea
        className={styles.textarea}
        value={text}
        onChange={e => {
          setText(e.target.value);
          setStatus("idle");
          setErrMsg("");
        }}
        spellCheck={false}
        placeholder="Markdown veya düz metin…"
        disabled={!loaded}
        aria-label="Proje notları"
      />
    </div>
  );
}
