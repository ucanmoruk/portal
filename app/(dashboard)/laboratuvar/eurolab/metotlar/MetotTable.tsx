"use client";

import { useState, useEffect, useCallback } from "react";
import styles from '@/app/styles/table.module.css';
import { useRouter } from "next/navigation";

interface Method {
    id: number;
    method_code: string;
    name: string;
    technique: string;
    matrix: string;
    validation_date: string | null;
    personnel: string[];
    status: string;
}

const PERSONNEL_OPTIONS = [
    "Ahmet Yılmaz",
    "Ayşe Demir",
    "Mehmet Kaya",
    "Canan Çelik",
    "Burak Yıldız",
    "Elif Akın"
];

const emptyForm = {
    method_code: "",
    name: "",
    technique: "",
    matrix: "",
    validation_date: "",
    personnel: [] as string[]
};

export default function MetotTable() {
    const router = useRouter();
    const [data, setData] = useState<Method[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"add" | "edit">("add");
    const [form, setForm] = useState(emptyForm);
    const [editId, setEditId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");

    const [deleteTarget, setDeleteTarget] = useState<Method | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchData = useCallback(async (s: string) => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/eurolab/methods?search=${encodeURIComponent(s)}`);
            if (!res.ok) throw new Error("Veri alınamadı");
            const json = await res.json();
            setData(json);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData(search);
    }, [fetchData, search]);

    const openAdd = () => {
        setForm(emptyForm);
        setEditId(null);
        setFormError("");
        setModalMode("add");
        setModalOpen(true);
    };

    const openEdit = (m: Method) => {
        setForm({
            method_code: m.method_code || "",
            name: m.name || "",
            technique: m.technique || "",
            matrix: m.matrix || "",
            validation_date: m.validation_date ? new Date(m.validation_date).toISOString().split('T')[0] : "",
            personnel: Array.isArray(m.personnel) ? m.personnel : []
        });
        setEditId(m.id);
        setFormError("");
        setModalMode("edit");
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!form.method_code || !form.name) {
            setFormError("Kod ve Analiz Adı zorunludur.");
            return;
        }
        setSaving(true);
        setFormError("");
        try {
            const url = modalMode === "edit" ? `/api/eurolab/methods/${editId}` : "/api/eurolab/methods";
            const method = modalMode === "edit" ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            if (!res.ok) throw new Error("İşlem başarısız");
            setModalOpen(false);
            fetchData(search);
        } catch (e: any) {
            setFormError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/eurolab/methods/${deleteTarget.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("İşlem başarısız");
            setDeleteTarget(null);
            fetchData(search);
        } catch (e: any) {
            alert(e.message);
        } finally {
            setDeleting(false);
        }
    };

    const togglePersonnel = (p: string) => {
        setForm(prev => {
            const exists = prev.personnel.includes(p);
            if (exists) {
                return { ...prev, personnel: prev.personnel.filter(item => item !== p) };
            } else {
                return { ...prev, personnel: [...prev.personnel, p] };
            }
        });
    };

    return (
        <>
            <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                    <div className={styles.searchBox}>
                        <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Kod, analiz, metot veya matriks..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className={styles.searchInput}
                        />
                    </div>
                </div>

                <div className={styles.toolbarRight}>
                    <span className={styles.totalCount}>{data.length} kayıt</span>
                    <button className={styles.addBtn} onClick={openAdd}>
                        <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                        </svg>
                        Yeni Metot
                    </button>
                </div>
            </div>

            <div className={styles.tableCard}>
                {error && <div className={styles.errorBar}>{error}</div>}
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th style={{ width: 80 }}>Kod</th>
                                <th>Analiz Adı</th>
                                <th>Metot</th>
                                <th>Matriks</th>
                                <th>Val. Tarihi</th>
                                <th>Yetkili Personel</th>
                                <th style={{ width: 90 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i}>{Array.from({ length: 7 }).map((__, j) => (
                                        <td key={j}><div className={styles.skeleton} /></td>
                                    ))}</tr>
                                ))
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={7}>
                                        <div className={styles.empty}>
                                            <p>Metot bulunamadı.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : data.map((m) => (
                                <tr key={m.id}>
                                    <td className={styles.tdMono}>
                                        <a 
                                            href={`/laboratuvar/eurolab/metotlar/${m.id}/talimat`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline font-semibold"
                                        >
                                            {m.method_code}
                                        </a>
                                    </td>
                                    <td className={styles.tdName}>{m.name}</td>
                                    <td>{m.technique}</td>
                                    <td>{m.matrix}</td>
                                    <td className={styles.tdMono}>{m.validation_date ? new Date(m.validation_date).toLocaleDateString('tr-TR') : "—"}</td>
                                    <td>
                                        <div className={styles.contactCell}>
                                            {(m.personnel || []).map(p => (
                                                <span key={p} className={styles.contactItem}>{p}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td>
                                        <div className={styles.actionBtns}>
                                            <button className={styles.editBtn} onClick={() => router.push(`/laboratuvar/eurolab/metotlar/${m.id}/validasyon`)} title="Validasyon Detayları">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                                                    <path d="M9 11l3 3L22 4" />
                                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                                </svg>
                                            </button>
                                            <button className={styles.editBtn} onClick={() => openEdit(m)} title="Düzenle">
                                                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                                                    <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                                                </svg>
                                            </button>
                                            <button className={styles.deleteBtn} onClick={() => setDeleteTarget(m)} title="Pasifleştir">
                                                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
                    <div className={styles.modal}>
                        <div className={styles.modalHeader}>
                            <h2>{modalMode === "add" ? "Yeni Metot Ekle" : "Metodu Düzenle"}</h2>
                            <button className={styles.modalClose} onClick={() => setModalOpen(false)}>
                                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                                </svg>
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            {formError && <div className={styles.formError}>{formError}</div>}
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>Metot Kodu <span className={styles.required}>*</span></label>
                                    <input value={form.method_code} onChange={e => setForm({ ...form, method_code: e.target.value })} placeholder="Örn: M001" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Analiz Adı <span className={styles.required}>*</span></label>
                                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Örn: Kafein Tayini" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Metot / Teknik</label>
                                    <input value={form.technique} onChange={e => setForm({ ...form, technique: e.target.value })} placeholder="Örn: HPLC-UV" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Matriks</label>
                                    <input value={form.matrix} onChange={e => setForm({ ...form, matrix: e.target.value })} placeholder="Örn: Gıda, Su" />
                                </div>
                                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                                    <label>Validasyon Tarihi</label>
                                    <input type="date" value={form.validation_date} onChange={e => setForm({ ...form, validation_date: e.target.value })} />
                                </div>
                                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                                    <label>Yetkili Personel (Çoklu Seçim)</label>
                                    <div className="flex flex-wrap gap-3 mt-1 p-3 border rounded-lg bg-slate-50">
                                        {PERSONNEL_OPTIONS.map(p => (
                                            <label key={p} className="flex items-center gap-2 cursor-pointer text-sm">
                                                <input 
                                                    type="checkbox" 
                                                    checked={form.personnel.includes(p)} 
                                                    onChange={() => togglePersonnel(p)}
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                {p}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.cancelBtn} onClick={() => setModalOpen(false)}>İptal</button>
                            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? "..." : "KAYDET"}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteTarget && (
                <div className={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
                    <div className={`${styles.modal} ${styles.modalSm}`}>
                        <div className={styles.modalHeader}><h2>Pasifleştir</h2></div>
                        <div className={styles.modalBody}><p><b>{deleteTarget.method_code} - {deleteTarget.name}</b> metodu pasifleştirilsin mi?</p></div>
                        <div className={styles.modalFooter}>
                            <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)}>Hayır</button>
                            <button className={styles.deleteBtnPrimary} onClick={handleDelete} disabled={deleting}>Evet</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
