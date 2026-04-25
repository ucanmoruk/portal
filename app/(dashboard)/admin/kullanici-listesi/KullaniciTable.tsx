"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/app/styles/table.module.css";

interface Kullanici {
  ID: number;
  Kadi: string;
  Ad: string;
  Soyad: string | null;
  Gorev: string | null;
  Email: string | null;
  Telefon: string | null;
  BirimID: number | null;
  Durum: string;
}

interface Birim {
  ID: number;
  Birim: string;
  FirmaID: number | null;
  Durum: string;
}

interface FormState {
  Kadi: string;
  Ad: string;
  Soyad: string;
  Gorev: string;
  Email: string;
  Telefon: string;
  Parola: string;
  BirimID: string;
}

const emptyForm: FormState = {
  Kadi: "",
  Ad: "",
  Soyad: "",
  Gorev: "",
  Email: "",
  Telefon: "",
  Parola: "",
  BirimID: "",
};

export default function KullaniciTable() {
  const [users, setUsers] = useState<Kullanici[]>([]);
  const [birimler, setBirimler] = useState<Birim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Kullanici | null>(null);
  const [deleting, setDeleting] = useState(false);

  const birimMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const birim of birimler) map.set(birim.ID, birim.Birim);
    return map;
  }, [birimler]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      [user.Kadi, user.Ad, user.Soyad, user.Gorev, user.Email, user.Telefon, user.BirimID ? birimMap.get(user.BirimID) : ""]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [users, search, birimMap]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, birimlerRes] = await Promise.all([
        fetch("/api/admin/kullanicilar"),
        fetch("/api/admin/birimler"),
      ]);
      if (!usersRes.ok) throw new Error((await usersRes.json()).error || "Kullanıcı listesi alınamadı");
      if (!birimlerRes.ok) throw new Error((await birimlerRes.json()).error || "Birim listesi alınamadı");
      setUsers(await usersRes.json());
      setBirimler(await birimlerRes.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openAdd = () => {
    setModalMode("add");
    setEditId(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (user: Kullanici) => {
    setModalMode("edit");
    setEditId(user.ID);
    setForm({
      Kadi: user.Kadi || "",
      Ad: user.Ad || "",
      Soyad: user.Soyad || "",
      Gorev: user.Gorev || "",
      Email: user.Email || "",
      Telefon: user.Telefon || "",
      Parola: "",
      BirimID: user.BirimID ? String(user.BirimID) : "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.Kadi.trim()) { setFormError("Kullanıcı adı zorunludur."); return; }
    if (!form.Ad.trim()) { setFormError("Ad zorunludur."); return; }
    if (modalMode === "add" && !form.Parola.trim()) { setFormError("Yeni kullanıcı için şifre zorunludur."); return; }

    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(modalMode === "add" ? "/api/admin/kullanicilar" : `/api/admin/kullanicilar/${editId}`, {
        method: modalMode === "add" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, BirimID: form.BirimID ? Number(form.BirimID) : null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kayıt başarısız");
      setModalOpen(false);
      await fetchData();
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
      const res = await fetch(`/api/admin/kullanicilar/${deleteTarget.ID}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Silme işlemi başarısız");
      setDeleteTarget(null);
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
              className={styles.searchInput}
              placeholder="Ad, kullanıcı adı, e-posta veya birim ara..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <span className={styles.totalCount}>{filteredUsers.length} kullanıcı</span>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.addBtn} onClick={openAdd}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Yeni Kullanıcı
          </button>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Kullanıcı</th>
                <th>Ad Soyad</th>
                <th>Görev</th>
                <th>İletişim</th>
                <th>Birim</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={7}><div className={styles.skeleton} /></td>
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={7}><div className={styles.empty}>Kayıt bulunamadı.</div></td></tr>
              ) : (
                filteredUsers.map((user, index) => (
                  <tr key={user.ID}>
                    <td className={styles.tdNum}>{index + 1}</td>
                    <td className={styles.tdMono}>{user.Kadi}</td>
                    <td className={styles.tdName}>{[user.Ad, user.Soyad].filter(Boolean).join(" ")}</td>
                    <td className={styles.tdSecondary}>{user.Gorev || "-"}</td>
                    <td>
                      <div className={styles.contactCell}>
                        {user.Email && <span className={styles.contactItem}>{user.Email}</span>}
                        {user.Telefon && <span className={styles.contactItem}>{user.Telefon}</span>}
                      </div>
                    </td>
                    <td>{user.BirimID ? birimMap.get(user.BirimID) || `Birim #${user.BirimID}` : "-"}</td>
                    <td>
                      <div className={styles.actionBtns}>
                        <button className={styles.editBtn} onClick={() => openEdit(user)} title="Düzenle">
                          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                            <path d="m13.586 3.586 2.828 2.828-8.486 8.486H5.1v-2.828l8.486-8.486ZM15 2.172a2 2 0 0 1 2.828 2.828l-.707.707-2.828-2.828.707-.707Z" />
                          </svg>
                        </button>
                        <button className={styles.deleteBtn} onClick={() => setDeleteTarget(user)} title="Pasif yap">
                          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                            <path fillRule="evenodd" d="M8.75 2a1.75 1.75 0 0 0-1.732 1.5H4.75a.75.75 0 0 0 0 1.5h.3l.72 10.08A2.25 2.25 0 0 0 8.014 17.2h3.972a2.25 2.25 0 0 0 2.244-2.12L14.95 5h.3a.75.75 0 0 0 0-1.5h-2.268A1.75 1.75 0 0 0 11.25 2h-2.5ZM8.5 3.75A.25.25 0 0 1 8.75 3.5h2.5a.25.25 0 0 1 .25.25v.25h-3v-.25ZM8.47 7.22a.75.75 0 0 1 .81.69l.25 5a.75.75 0 0 1-1.498.075l-.25-5a.75.75 0 0 1 .69-.765Zm3.06 0a.75.75 0 0 1 .69.765l-.25 5a.75.75 0 0 1-1.498-.075l.25-5a.75.75 0 0 1 .808-.69Z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{modalMode === "add" ? "Yeni Kullanıcı" : "Kullanıcıyı Düzenle"}</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Kullanıcı Adı <span className={styles.required}>*</span></label>
                  <input value={form.Kadi} onChange={(e) => setField("Kadi", e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>Şifre {modalMode === "add" && <span className={styles.required}>*</span>}</label>
                  <input
                    type="password"
                    value={form.Parola}
                    placeholder={modalMode === "edit" ? "Değiştirmemek için boş bırak" : ""}
                    onChange={(e) => setField("Parola", e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Ad <span className={styles.required}>*</span></label>
                  <input value={form.Ad} onChange={(e) => setField("Ad", e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>Soyad</label>
                  <input value={form.Soyad} onChange={(e) => setField("Soyad", e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>Görev</label>
                  <input value={form.Gorev} onChange={(e) => setField("Gorev", e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>Birim</label>
                  <select value={form.BirimID} onChange={(e) => setField("BirimID", e.target.value)}>
                    <option value="">Seçilmedi</option>
                    {birimler.map((birim) => (
                      <option key={birim.ID} value={birim.ID}>{birim.Birim}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>E-posta</label>
                  <input type="email" value={form.Email} onChange={(e) => setField("Email", e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>Telefon</label>
                  <input value={form.Telefon} onChange={(e) => setField("Telefon", e.target.value)} />
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setModalOpen(false)} disabled={saving}>Vazgeç</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? "Kaydediliyor" : "Kaydet"}</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modal} ${styles.modalSm}`}>
            <div className={styles.modalHeader}>
              <h2>Kullanıcıyı Pasif Yap</h2>
              <button className={styles.modalClose} onClick={() => setDeleteTarget(null)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.deleteWarning}>
                <strong>{[deleteTarget.Ad, deleteTarget.Soyad].filter(Boolean).join(" ")}</strong> kullanıcısı pasif yapılacak.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)} disabled={deleting}>Vazgeç</button>
              <button className={styles.deleteBtnPrimary} onClick={handleDelete} disabled={deleting}>{deleting ? "İşleniyor" : "Pasif Yap"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
