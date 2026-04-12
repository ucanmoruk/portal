"use client";

import { useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";

interface LogRow {
  ID: number;
  Tarih: string;
  Eylem: string;
  Aciklama: string | null;
  KullaniciID: number | null;
  KullaniciAd: string | null;
}

interface Props {
  recordId: string | null;
}

export default function Tab4Gecmis({ recordId }: Props) {
  const [rows, setRows]   = useState<LogRow[]>([]);
  const [loading, setL]   = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!recordId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setL(true);
    setError("");
    
    console.log("Loading logs for recordId:", recordId); // Debug
    
    fetch(`/api/numune-form/${recordId}/log`)
      .then(r => {
        console.log("Response status:", r.status); // Debug
        return r.json();
      })
      .then(data => {
        if (cancelled) return;
        console.log("Response data:", data); // Debug
        if (Array.isArray(data)) {
          setRows(data);
          console.log("Loaded rows:", data.length); // Debug
        } else {
          setError(data.error || "Yüklenemedi");
          console.error("API Error:", data); // Debug
        }
      })
      .catch(err => { 
        if (!cancelled) {
          console.error("Fetch error:", err); // Debug
          setError("Ağ hatası: " + err.message);
        }
      })
      .finally(() => { if (!cancelled) setL(false); });
    return () => { cancelled = true; };
  }, [recordId]);

  if (!recordId) {
    return (
      <div style={{ padding: "28px 24px", color: "var(--color-text-secondary)", fontSize: "0.875rem", lineHeight: 1.6 }}>
        Kayıt oluşturulduktan sonra ürün geçmişi (oluşturma, güncelleme, revizyon vb.) bu sekmede listelenir.
        Analiz sonuçları ve raporlama tarihleri için veritabanında ayrı alanlar tanımlandığında buraya bağlanabilir.
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 28, color: "var(--color-text-tertiary)", fontSize: "0.875rem" }}>Yükleniyor…</div>;
  }

  if (error) {
    return <div className={styles.formError} style={{ margin: 20 }}>{error}</div>;
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: 28, color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
        Henüz log kaydı yok. Kayıt kaydedildiğinde ve güncellendiğinde burada görünür.
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 24px 24px" }}>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 160 }}>Tarih</th>
              <th style={{ width: 140 }}>İşlem</th>
              <th>Açıklama</th>
              <th style={{ width: 180 }}>Kullanıcı</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.ID}>
                <td style={{ fontVariantNumeric: "tabular-nums", fontSize: "0.82rem" }}>{r.Tarih}</td>
                <td style={{ fontWeight: 600, fontSize: "0.82rem" }}>{r.Eylem}</td>
                <td style={{ color: "var(--color-text-secondary)", fontSize: "0.82rem", whiteSpace: "pre-wrap" }}>{r.Aciklama || "—"}</td>
                <td style={{ fontSize: "0.8rem", color: "var(--color-text-tertiary)" }}>{r.KullaniciAd ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
