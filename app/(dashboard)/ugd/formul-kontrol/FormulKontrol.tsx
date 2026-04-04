"use client";

import { useState, useRef } from "react";
import styles from '@/app/styles/table.module.css';
import * as XLSX from "xlsx";

interface MatchedIngredient {
  inputName: string;
  inputAmount: string;
  matched: boolean;
  INCIName: string | null;
  Cas: string | null;
  Ec: string | null;
  Functions: string | null;
  Regulation: string | null;
  Link?: string | null;
  Maks: string | null;
  Diger: string | null;
  Etiket: string | null;
}

export default function FormulKontrol() {
  const [inputText, setInputText] = useState("");
  const [results, setResults] = useState<MatchedIngredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    setInputText("");
    setResults([]);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processItems = async (items: { name: string; amount: string }[]) => {
    if (items.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/formul-kontrol/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("Kontrol işlemi başarısız");
      const json = await res.json();
      setResults(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasteCheck = () => {
    if (!inputText.trim()) {
      setError("Lütfen formülü yapıştırın veya dosya seçin.");
      return;
    }
    const lines = inputText.split("\n").filter(l => l.trim());
    const items = lines.map(l => {
      const parts = l.split("\t");
      if (parts.length < 2) {
          const fallback = l.split(/\s\s+/); // double space or more
          if (fallback.length >= 2) return { name: fallback[0].trim(), amount: fallback[1].trim() };
      }
      return { name: (parts[0] || "").trim(), amount: (parts[1] || "0").trim() };
    }).filter(i => i.name);

    processItems(items);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        // "INCI İsmi" ve "Üst Değer(%)" kolonlarını ara
        const items = data.map((row: any) => {
          return {
            name: (row["INCI İsmi"] || row["INCI ismi"] || row["INCI"])?.toString() || "",
            amount: (row["Üst Değer(%)"] || row["Üst değer(%)"] || row["Miktar"])?.toString() || "0"
          };
        }).filter(i => i.name);

        if (items.length === 0) {
          setError("Excel dosyasında 'INCI İsmi' ve 'Üst Değer(%)' başlıkları bulunamadı.");
          return;
        }

        processItems(items);
      } catch (err) {
        setError("Dosya okunurken hata oluştu.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const addManualRow = () => {
    setResults([
      ...results,
      { inputName: "", inputAmount: "0", matched: false, INCIName: null, Cas: null, Ec: null, Functions: null, Regulation: null, Link: null, Maks: null, Diger: null, Etiket: null }
    ]);
  };

  const updateRow = async (index: number, name: string) => {
    if (!name) return;
    try {
      const res = await fetch("/api/formul-kontrol/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ name, amount: results[index].inputAmount }] }),
      });
      const json = await res.json();
      if (json && json[0]) {
        const newResults = [...results];
        newResults[index] = json[0];
        setResults(newResults);
      }
    } catch (e) {}
  };

  return (
    <>
      <div className={styles.tableCard} style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Formül Girişi</h3>
            <div style={{ display: 'flex', gap: 10 }}>
                <input 
                    type="file" 
                    accept=".xlsx, .xls, .csv" 
                    ref={fileInputRef}
                    onChange={handleFileUpload} 
                    style={{ display: 'none' }} 
                />
                <button 
                    className={styles.addBtn} 
                    style={{ background: '#1d6f42' }} 
                    onClick={() => fileInputRef.current?.click()}
                >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style={{ marginRight: 6 }}>
                        <path d="M4.5 2A2.5 2.5 0 0 0 2 4.5v11A2.5 2.5 0 0 0 4.5 18h11a2.5 2.5 0 0 0 2.5-2.5V7.621a2.5 2.5 0 0 0-.732-1.768l-2.621-2.621A2.5 2.5 0 0 0 12.379 2H4.5Zm10.06 4.5-2.56-2.56a1 1 0 0 0-.25-.5h3.06a1 1 0 0 0-.25.5ZM10 7.5a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 10 7.5Z" />
                    </svg>
                    Excel İçe Aktar
                </button>
            </div>
        </div>
        
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
          Excel'den <strong>"INCI İsmi"</strong> ve <strong>"Üst Değer(%)"</strong> sütunlarını seçip buraya yapıştırabilir veya dosyayı yükleyebilirsiniz.
        </p>
        
        <textarea
          className={styles.searchInput}
          style={{ width: '100%', minHeight: 150, padding: 16, fontFamily: 'monospace' }}
          placeholder="İsterseniz kopyalayıp buraya yapıştırın (Excel stili)..."
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          disabled={loading}
        />
        
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button className={styles.saveBtn} onClick={handlePasteCheck} disabled={loading}>
            {loading ? "Analiz Ediliyor..." : "ANALİZİ BAŞLAT"}
          </button>
          <button className={styles.cancelBtn} onClick={handleClear}>Temizle</button>
        </div>
        {error && <div className={styles.formError} style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {results.length > 0 && (
        <div className={styles.tableCard}>
          <div className={styles.toolbar} style={{ padding: '12px 24px' }}>
            <div className={styles.toolbarLeft}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Değerlendirme Tablosu</h3>
              <span className={styles.totalCount} style={{ marginLeft: 12 }}>{results.length} bileşen bulundu</span>
            </div>
            <div className={styles.toolbarRight}>
               <button className={styles.addBtn} onClick={addManualRow}>+ Yeni Satır Ekle</button>
            </div>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Giriş (INCI / Miktar)</th>
                  <th>Cas / EC</th>
                  <th>Functions</th>
                  <th>Annex (Reg)</th>
                  <th>Limitler (Maks/Diğer)</th>
                  <th>Etiket Bilgisi</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => (
                  <tr key={i} style={{ opacity: row.matched ? 1 : 0.65, background: !row.matched ? '#fff0f0' : 'transparent' }}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {row.matched ? (
                          <a 
                            href={row.Link || "#"} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            style={{ color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'none' }}
                          >
                            {row.INCIName}
                          </a>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ color: '#d32f2f' }}>⚠️</span>
                            <input 
                                placeholder="Doğru ismi girin" 
                                defaultValue={row.inputName} 
                                onBlur={(e) => updateRow(i, e.target.value)} 
                                style={{ border: '1px solid #ffb3b3', borderRadius: 4, padding: '2px 6px', fontSize: '0.8rem', width: '100%' }}
                            />
                          </div>
                        )}
                        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Miktar: {row.inputAmount}%</span>
                      </div>
                    </td>
                    <td className={styles.tdMono}>
                      {row.Cas && <div>{row.Cas}</div>}
                      {row.Ec && <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{row.Ec}</div>}
                    </td>
                    <td style={{ fontSize: '0.75rem' }}>{row.Functions || "—"}</td>
                    <td style={{ fontSize: '0.75rem' }}>{row.Regulation || "—"}</td>
                    <td style={{ fontSize: '0.75rem' }}>
                        {row.Maks && <div><strong>Maks:</strong> {row.Maks}</div>}
                        {row.Diger && <div><strong>Sınır:</strong> {row.Diger}</div>}
                        {!row.Maks && !row.Diger && <span style={{ opacity: 0.5 }}>—</span>}
                    </td>
                    <td style={{ fontSize: '0.7rem' }}>{row.Etiket || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
