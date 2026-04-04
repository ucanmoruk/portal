"use client";

import { useState, useEffect } from "react";
import styles from "@/app/styles/table.module.css";
import { MENU_TREE, type MenuItem } from "@/lib/menuConfig";
import pageStyles from "./yetki.module.css";

interface Kullanici {
  ID: number;
  Kadi: string;
  Ad: string;
  Soyad: string;
  Gorev: string;
  Email: string;
  BirimID: number;
}

export default function YetkiTable() {
  const [users, setUsers]       = useState<Kullanici[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  // Modal
  const [selected, setSelected]   = useState<Kullanici | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [modalLoading, setModalLoading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState("");
  const [saveErr, setSaveErr]     = useState("");

  useEffect(() => {
    fetch("/api/admin/kullanicilar")
      .then(r => r.json())
      .then(data => { setUsers(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const openModal = async (user: Kullanici) => {
    setSelected(user);
    setSaveMsg("");
    setSaveErr("");
    setModalLoading(true);
    try {
      const res  = await fetch(`/api/admin/yetki?userId=${user.ID}`);
      const data = await res.json();
      setCheckedKeys(new Set(data.keys || []));
    } catch {
      setCheckedKeys(new Set());
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => { setSelected(null); setCheckedKeys(new Set()); };

  // ── Checkbox mantığı ──
  const toggle = (key: string, item: MenuItem) => {
    const next = new Set(checkedKeys);
    if (next.has(key)) {
      // kendi + çocuklarını kaldır
      next.delete(key);
      item.children?.forEach(c => next.delete(c.key));
    } else {
      // kendi + çocuklarını ekle
      next.add(key);
      item.children?.forEach(c => next.add(c.key));
    }
    // parent'ı güncelle
    setCheckedKeys(next);
  };

  const toggleChild = (childKey: string, parentItem: MenuItem) => {
    const next = new Set(checkedKeys);
    if (next.has(childKey)) {
      next.delete(childKey);
      // hiç çocuk kalmadıysa parent'ı da kaldır
      const anyLeft = parentItem.children!.some(c => c.key !== childKey && next.has(c.key));
      if (!anyLeft) next.delete(parentItem.key);
    } else {
      next.add(childKey);
      next.add(parentItem.key); // parent otomatik seçili
    }
    setCheckedKeys(next);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveMsg("");
    setSaveErr("");
    try {
      const res = await fetch("/api/admin/yetki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.ID, keys: [...checkedKeys] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaveMsg(`${data.count} yetki kaydedildi.`);
    } catch (e: any) {
      setSaveErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const initials = (u: Kullanici) =>
    `${u.Ad?.[0] || ""}${u.Soyad?.[0] || ""}`.toUpperCase() || u.Kadi[0].toUpperCase();

  return (
    <>
      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>Ad Soyad</th>
                <th>Kullanıcı Adı</th>
                <th>Görev</th>
                <th>E-posta</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j}><span className={styles.skeleton} /></td>
                      ))}
                    </tr>
                  ))
                : users.map(u => (
                    <tr key={u.ID}>
                      <td>
                        <div className={pageStyles.avatar}>{initials(u)}</div>
                      </td>
                      <td className={styles.tdName}>{u.Ad} {u.Soyad}</td>
                      <td className={styles.tdMono}>{u.Kadi}</td>
                      <td className={styles.tdSecondary}>{u.Gorev || "—"}</td>
                      <td>
                        {u.Email
                          ? <a className={styles.emailLink} href={`mailto:${u.Email}`}>{u.Email}</a>
                          : <span className={styles.tdSecondary}>—</span>}
                      </td>
                      <td>
                        <button
                          className={styles.addBtn}
                          style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                          onClick={() => openModal(u)}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                          </svg>
                          Yetki Düzenle
                        </button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ YETKİ MODAL ══ */}
      {selected && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div
            className={styles.modal}
            style={{ maxWidth: 520 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className={pageStyles.avatarSm}>{initials(selected)}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--color-text-primary)" }}>
                    {selected.Ad} {selected.Soyad}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                    {selected.Gorev || selected.Kadi}
                  </div>
                </div>
              </div>
              <button className={styles.modalClose} onClick={closeModal}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {/* Body — checkbox ağacı */}
            <div className={styles.modalBody}>
              <p style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", marginBottom: 16 }}>
                Bu kullanıcının erişebileceği menüleri seçin.
              </p>

              {modalLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[1,2,3,4].map(i => <span key={i} className={styles.skeleton} style={{ height: 18 }} />)}
                </div>
              ) : (
                <div className={pageStyles.menuTree}>
                  {MENU_TREE.map(item => (
                    <div key={item.key} className={pageStyles.menuGroup}>
                      {/* Parent */}
                      <label className={pageStyles.menuParent}>
                        <input
                          type="checkbox"
                          checked={checkedKeys.has(item.key)}
                          onChange={() => toggle(item.key, item)}
                        />
                        <span className={pageStyles.menuParentLabel}>{item.label}</span>
                      </label>

                      {/* Children */}
                      {item.children && (
                        <div className={pageStyles.menuChildren}>
                          {item.children.map(child => (
                            <label key={child.key} className={pageStyles.menuChild}>
                              <input
                                type="checkbox"
                                checked={checkedKeys.has(child.key)}
                                onChange={() => toggleChild(child.key, item)}
                              />
                              <span>{child.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {saveMsg && (
                <div style={{ marginTop: 14, padding: "8px 12px", background: "var(--color-success-light)", color: "#248a3d", borderRadius: "var(--radius-sm)", fontSize: "0.82rem" }}>
                  ✓ {saveMsg}
                </div>
              )}
              {saveErr && (
                <div className={styles.formError} style={{ marginTop: 14 }}>{saveErr}</div>
              )}
            </div>

            {/* Footer */}
            <div className={styles.modalFooter}>
              <span style={{ fontSize: "0.78rem", color: "var(--color-text-tertiary)", marginRight: "auto" }}>
                {checkedKeys.size} menü seçili
              </span>
              <button className={styles.cancelBtn} onClick={closeModal} disabled={saving}>Kapat</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving || modalLoading}>
                {saving ? <span className={styles.loader} /> : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
