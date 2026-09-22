"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  List,
  ListTodo,
  MessageSquare,
  Plus,
  Search,
  Send,
  Users,
} from "lucide-react";
import styles from "./iletisim.module.css";

type Person = { ID: number | string; Ad: string };
type Read = { kullaniciId: string; okunduAt: string };
type Item = {
  id: number;
  baslik: string;
  icerik: string;
  olusturanId: string;
  olusturanAd: string;
  aliciId: string;
  aliciAd: string;
  durum: string;
  terminTarihi: string | null;
  createdAt: string;
  okundu: boolean;
  okuyanlar?: Read[];
  akış?: Array<{ durum: string; kullaniciAd: string; createdAt: string }>;
};
type Thread = { id: number; messages: Item[] };
const fmt = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("tr-TR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "-";
const PAGE_SIZE = 8;
export default function IletisimClient({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const [tab, setTab] = useState("Duyuru");
  const [data, setData] = useState<{
    duyurular: Item[];
    mesajlar: Thread[];
    gorevler: Item[];
  }>({ duyurular: [], mesajlar: [], gorevler: [] });
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [compose, setCompose] = useState(false);
  const [form, setForm] = useState({
    tur: "Duyuru",
    baslik: "",
    icerik: "",
    aliciIds: [] as string[],
    terminTarihi: "",
  });
  const [reply, setReply] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [announcementFilter, setAnnouncementFilter] = useState("Tümü");
  const [taskFilter, setTaskFilter] = useState("Tümü");
  const [taskView, setTaskView] = useState<"liste" | "takvim">("liste");
  const [calendarTaskId, setCalendarTaskId] = useState<number | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/kys/iletisim");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veriler alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    fetch("/api/kullanicilar")
      .then((r) => r.json())
      .then((j) => setPeople(j.data || []))
      .catch(() => {});
    return () => clearTimeout(initial);
  }, [load]);
  useEffect(() => {
    if (calendarTaskId === null) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarTaskId(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [calendarTaskId]);
  const peopleById = useMemo(
    () => new Map(people.map((p) => [String(p.ID), p.Ad])),
    [people],
  );
  async function create() {
    setError("");
    const aliciAdlar = form.aliciIds.map((id) => peopleById.get(id) || id);
    const r = await fetch("/api/kys/iletisim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        aliciId: form.aliciIds[0] || "",
        aliciAd: aliciAdlar[0] || "",
        aliciAdlar,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error || "Kayıt oluşturulamadı.");
      return;
    }
    setCompose(false);
    setForm({
      tur: tab,
      baslik: "",
      icerik: "",
      aliciIds: [],
      terminTarihi: "",
    });
    await load();
  }
  async function action(body: Record<string, unknown>) {
    const r = await fetch("/api/kys/iletisim", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) await load();
  }
  async function answer(id: number) {
    const value = reply[id]?.trim();
    if (!value) return;
    const r = await fetch("/api/kys/iletisim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ islem: "yanit", konusmaId: id, icerik: value }),
    });
    if (r.ok) {
      setReply((x) => ({ ...x, [id]: "" }));
      await load();
    }
  }
  function toggle(id: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function switchTab(next: string) {
    setTab(next);
    setPage(1);
    setSearch("");
  }
  const announcements = useMemo(
    () =>
      data.duyurular.filter((item) => {
        const q = search.toLocaleLowerCase("tr-TR");
        const matches =
          !q ||
          `${item.baslik} ${item.icerik} ${item.olusturanAd}`
            .toLocaleLowerCase("tr-TR")
            .includes(q);
        const state =
          item.okundu || item.olusturanId === currentUserId
            ? "Okundu"
            : "Okunmadı";
        return (
          matches &&
          (announcementFilter === "Tümü" || announcementFilter === state)
        );
      }),
    [data.duyurular, search, announcementFilter, currentUserId],
  );
  const tasks = useMemo(
    () =>
      data.gorevler.filter((item) => {
        const overdue =
          item.terminTarihi &&
          new Date(`${item.terminTarihi}T23:59:59`) < new Date() &&
          item.durum !== "Tamamlandı";
        const state = overdue ? "Termini Geçmiş" : item.durum;
        const q = search.toLocaleLowerCase("tr-TR");
        return (
          (!q ||
            `${item.baslik} ${item.icerik} ${item.aliciAd}`
              .toLocaleLowerCase("tr-TR")
              .includes(q)) &&
          (taskFilter === "Tümü" || taskFilter === state)
        );
      }),
    [data.gorevler, search, taskFilter],
  );
  const calendarTask = calendarTaskId
    ? tasks.find((task) => task.id === calendarTaskId) ?? null
    : null;
  const pagedAnnouncements = announcements.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const totalAnnouncementPages = Math.max(
    1,
    Math.ceil(announcements.length / PAGE_SIZE),
  );
  const tabs = [
    {
      id: "Duyuru",
      label: "Duyurular",
      icon: Bell,
      count: data.duyurular.length,
    },
    {
      id: "Mesaj",
      label: "Mesajlar",
      icon: MessageSquare,
      count: data.mesajlar.length,
    },
    {
      id: "Görev",
      label: "Görevler",
      icon: ListTodo,
      count: data.gorevler.length,
    },
  ];
  const days = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return [
      ...Array(first.getDay() === 0 ? 6 : first.getDay() - 1).fill(null),
      ...Array.from({ length: count }, (_, i) => i + 1),
    ];
  }, []);
  return (
    <div className={styles.shell}>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.tabs}>
        {tabs.map((x) => (
          <button
            key={x.id}
            className={tab === x.id ? styles.active : ""}
            onClick={() => switchTab(x.id)}
          >
            <x.icon size={16} />
            {x.label}
            <span>{x.count}</span>
          </button>
        ))}
        <button
          className={styles.newButton}
          onClick={() => {
            setForm({
              tur: tab,
              baslik: "",
              icerik: "",
              aliciIds: [],
              terminTarihi: "",
            });
            setCompose(true);
          }}
        >
          <Plus size={16} />
          Yeni {tab.toLocaleLowerCase("tr-TR")}
        </button>
      </div>
      <div className={styles.filters}>
        <label>
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={`${tab} ara…`}
          />
        </label>
        {tab === "Duyuru" && (
          <select
            value={announcementFilter}
            onChange={(e) => {
              setAnnouncementFilter(e.target.value);
              setPage(1);
            }}
          >
            <option>Tümü</option>
            <option>Okunmadı</option>
            <option>Okundu</option>
          </select>
        )}
        {tab === "Görev" && (
          <>
            <select
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
            >
              <option>Tümü</option>
              <option>Atandı</option>
              <option>Termini Geçmiş</option>
              <option>Başladı</option>
              <option>Tamamlandı</option>
            </select>
            <div className={styles.viewToggle}>
              <button
                className={taskView === "liste" ? styles.selected : ""}
                onClick={() => setTaskView("liste")}
              >
                <List size={15} />
                Liste
              </button>
              <button
                className={taskView === "takvim" ? styles.selected : ""}
                onClick={() => setTaskView("takvim")}
              >
                <CalendarDays size={15} />
                Takvim
              </button>
            </div>
          </>
        )}
      </div>
      {loading ? (
        <div className={styles.empty}>Yükleniyor…</div>
      ) : tab === "Duyuru" ? (
        <>
          <div className={styles.feed}>
            {pagedAnnouncements.map((item) => {
              const open = expanded.has(item.id);
              return (
                <article
                  key={item.id}
                  className={`${styles.card} ${!item.okundu && item.olusturanId !== currentUserId ? styles.unread : ""}`}
                >
                  <button
                    className={styles.accordionHead}
                    onClick={() => {
                      toggle(item.id);
                      if (!item.okundu && item.olusturanId !== currentUserId)
                        void action({ islem: "okundu", id: item.id });
                    }}
                  >
                    <span>
                      <small>
                        <Bell size={13} /> {item.olusturanAd}
                      </small>
                      <strong>{item.baslik}</strong>
                      <time>{fmt(item.createdAt)}</time>
                    </span>
                    <ChevronDown
                      className={open ? styles.rotated : ""}
                      size={18}
                    />
                  </button>
                  {open && (
                    <div className={styles.cardBody}>
                      <p>{item.icerik}</p>
                      {item.olusturanId === currentUserId && (
                        <div className={styles.receipts}>
                          <strong>
                            <Users size={14} />
                            Okuma bilgisi
                          </strong>
                          {item.okuyanlar?.length ? (
                            <div>
                              {item.okuyanlar.map((read) => (
                                <span key={read.kullaniciId}>
                                  <Check size={13} />
                                  <b>
                                    {peopleById.get(read.kullaniciId) ||
                                      read.kullaniciId}
                                  </b>
                                  {fmt(read.okunduAt)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p>Henüz okuyan olmadı.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <div className={styles.pagination}>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Önceki
            </button>
            <span>
              {page} / {totalAnnouncementPages}
            </span>
            <button
              disabled={page >= totalAnnouncementPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sonraki
            </button>
          </div>
        </>
      ) : tab === "Mesaj" ? (
        <div className={styles.feed}>
          {data.mesajlar
            .filter((thread) => {
              const last = thread.messages.at(-1)!;
              return (
                !search ||
                `${last.baslik} ${last.olusturanAd} ${last.aliciAd}`
                  .toLocaleLowerCase("tr-TR")
                  .includes(search.toLocaleLowerCase("tr-TR"))
              );
            })
            .map((thread) => {
              const last = thread.messages.at(-1)!;
              const other =
                last.olusturanId === currentUserId
                  ? last.aliciAd
                  : last.olusturanAd;
              const open = expanded.has(thread.id);
              const unread = thread.messages.filter(
                (x) => !x.okundu && x.aliciId === currentUserId,
              ).length;
              return (
                <article className={styles.thread} key={thread.id}>
                  <button
                    className={styles.accordionHead}
                    onClick={() => {
                      toggle(thread.id);
                      if (!open)
                        thread.messages
                          .filter(
                            (x) => !x.okundu && x.aliciId === currentUserId,
                          )
                          .forEach(
                            (x) => void action({ islem: "okundu", id: x.id }),
                          );
                    }}
                  >
                    <span>
                      <small>
                        Özel konuşma · {other}
                        {unread > 0 && (
                          <b className={styles.unreadCount}>{unread}</b>
                        )}
                      </small>
                      <strong>{last.baslik}</strong>
                      <time>{fmt(last.createdAt)}</time>
                    </span>
                    <ChevronDown
                      className={open ? styles.rotated : ""}
                      size={18}
                    />
                  </button>
                  {open && (
                    <>
                      <div className={styles.messages}>
                        {thread.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={
                              msg.olusturanId === currentUserId
                                ? styles.mine
                                : styles.theirs
                            }
                          >
                            <strong>{msg.olusturanAd}</strong>
                            <p>{msg.icerik}</p>
                            <small>
                              {fmt(msg.createdAt)}
                              {msg.okundu && msg.olusturanId === currentUserId
                                ? " · Okundu"
                                : ""}
                            </small>
                          </div>
                        ))}
                      </div>
                      <div className={styles.reply}>
                        <input
                          value={reply[thread.id] || ""}
                          onChange={(e) =>
                            setReply((x) => ({
                              ...x,
                              [thread.id]: e.target.value,
                            }))
                          }
                          placeholder="Yanıt yazın…"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void answer(thread.id);
                          }}
                        />
                        <button onClick={() => void answer(thread.id)}>
                          <Send size={15} />
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
        </div>
      ) : taskView === "takvim" ? (
        <div className={styles.calendar}>
          <header>
            {new Date().toLocaleDateString("tr-TR", {
              month: "long",
              year: "numeric",
            })}
          </header>
          <div className={styles.weekdays}>
            {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
          <div className={styles.calendarGrid}>
            {days.map((day, index) => (
              <div key={index} className={!day ? styles.blank : ""}>
                {day && (
                  <>
                    <b>{day}</b>
                    {tasks
                      .filter(
                        (task) =>
                          task.terminTarihi &&
                          new Date(task.terminTarihi).getDate() === day &&
                          new Date(task.terminTarihi).getMonth() ===
                            new Date().getMonth() &&
                          new Date(task.terminTarihi).getFullYear() ===
                            new Date().getFullYear(),
                      )
                      .map((task) => {
                        const overdue = Boolean(
                          task.terminTarihi &&
                            new Date(`${task.terminTarihi}T23:59:59`) <
                              new Date() &&
                            task.durum !== "Tamamlandı",
                        );
                        const state = overdue
                          ? "Gecikti"
                          : task.durum === "Atandı"
                            ? "Bekliyor"
                            : task.durum;
                        return (
                          <button
                            key={task.id}
                            className={`${styles.calendarTask} ${styles[`calendar${state}`] || ""}`}
                            title={`${task.baslik} · ${overdue ? "Termini Geçmiş" : task.durum}`}
                            onClick={() => {
                              setCalendarTaskId(task.id);
                              if (
                                !task.okundu &&
                                task.aliciId === currentUserId
                              )
                                void action({
                                  islem: "okundu",
                                  id: task.id,
                                });
                            }}
                          >
                            {task.baslik}
                          </button>
                        );
                      })}
                  </>
                )}
              </div>
            ))}
          </div>
          {calendarTask && (
            <div
              className={styles.overlay}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setCalendarTaskId(null);
              }}
            >
            <aside
              className={`${styles.modal} ${styles.calendarDetail}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="calendar-task-title"
            >
              <header>
                <span>
                  <small>
                    {calendarTask.aliciAd} · Atayan {calendarTask.olusturanAd}
                  </small>
                  <strong id="calendar-task-title">{calendarTask.baslik}</strong>
                </span>
                <button
                  aria-label="Görev detayını kapat"
                  onClick={() => setCalendarTaskId(null)}
                >
                  ×
                </button>
              </header>
              <p>{calendarTask.icerik || "Açıklama girilmemiş."}</p>
              <div className={styles.calendarDetailMeta}>
                <span>Durum: {calendarTask.durum}</span>
                <span>
                  Termin: {calendarTask.terminTarihi
                    ? new Date(calendarTask.terminTarihi).toLocaleDateString(
                        "tr-TR",
                      )
                    : "Yok"}
                </span>
              </div>
              <div className={styles.timeline}>
                {calendarTask.akış?.map((log, index) => (
                  <div key={`${log.createdAt}-${index}`}>
                    <span />
                    <p>
                      <strong>{log.durum}</strong>
                      <small>
                        {log.kullaniciAd} · {fmt(log.createdAt)}
                      </small>
                    </p>
                  </div>
                ))}
              </div>
              <div className={styles.taskActions}>
                {calendarTask.durum === "Atandı" &&
                  calendarTask.aliciId === currentUserId && (
                    <button
                      className={styles.start}
                      onClick={() =>
                        void action({
                          islem: "gorev",
                          id: calendarTask.id,
                          durum: "Başladı",
                        })
                      }
                    >
                      <Clock3 size={15} />
                      Başlat
                    </button>
                  )}
                {calendarTask.durum === "Başladı" &&
                  (calendarTask.aliciId === currentUserId ||
                    calendarTask.olusturanId === currentUserId) && (
                    <button
                      className={styles.finish}
                      onClick={() =>
                        void action({
                          islem: "gorev",
                          id: calendarTask.id,
                          durum: "Tamamlandı",
                        })
                      }
                    >
                      <CheckCircle2 size={15} />
                      Tamamla
                    </button>
                  )}
              </div>
            </aside>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.taskList}>
          {tasks.map((item) => {
            const overdue = Boolean(
              item.terminTarihi &&
                new Date(`${item.terminTarihi}T23:59:59`) < new Date() &&
                item.durum !== "Tamamlandı",
            );
            const state = overdue
              ? "Gecikti"
              : item.durum === "Atandı"
                ? "Bekliyor"
                : item.durum;
            const open = expanded.has(item.id);
            return (
              <article
                className={`${styles.taskRow} ${styles[`state${state}`] || ""}`}
                key={item.id}
              >
                <button
                  className={styles.taskSummary}
                  onClick={() => {
                    toggle(item.id);
                    if (!item.okundu && item.aliciId === currentUserId)
                      void action({ islem: "okundu", id: item.id });
                  }}
                >
                  <span className={styles.statusDot} />
                  <span className={styles.taskMain}>
                    <strong>{item.baslik}</strong>
                    <small>
                      {item.aliciAd} · Atayan {item.olusturanAd}
                    </small>
                  </span>
                  <span className={styles.taskStatus}>
                    {overdue ? "Termini Geçmiş" : item.durum}
                  </span>
                  <time>
                    {item.terminTarihi
                      ? new Date(item.terminTarihi).toLocaleDateString("tr-TR")
                      : "Termin yok"}
                  </time>
                  <ChevronDown
                    className={open ? styles.rotated : ""}
                    size={17}
                  />
                </button>
                {open && (
                  <div className={styles.taskDetail}>
                    <p>{item.icerik}</p>
                    <div className={styles.timeline}>
                      {item.akış?.map((log, i) => (
                        <div key={`${log.createdAt}-${i}`}>
                          <span />
                          <p>
                            <strong>{log.durum}</strong>
                            <small>
                              {log.kullaniciAd} · {fmt(log.createdAt)}
                            </small>
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className={styles.taskActions}>
                      {item.durum === "Atandı" &&
                        item.aliciId === currentUserId && (
                          <button
                            className={styles.start}
                            onClick={() =>
                              void action({
                                islem: "gorev",
                                id: item.id,
                                durum: "Başladı",
                              })
                            }
                          >
                            <Clock3 size={15} />
                            Başlat
                          </button>
                        )}
                      {item.durum === "Başladı" &&
                        (item.aliciId === currentUserId ||
                          item.olusturanId === currentUserId) && (
                          <button
                            className={styles.finish}
                            onClick={() =>
                              void action({
                                islem: "gorev",
                                id: item.id,
                                durum: "Tamamlandı",
                              })
                            }
                          >
                            <CheckCircle2 size={15} />
                            Tamamla
                          </button>
                        )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {compose && (
        <div className={styles.overlay}>
          <div className={styles.modal} role="dialog" aria-modal="true">
            <header>
              <h2>Yeni {form.tur.toLocaleLowerCase("tr-TR")}</h2>
              <button onClick={() => setCompose(false)}>×</button>
            </header>
            <div className={styles.form}>
              <label>
                Tür
                <select
                  value={form.tur}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tur: e.target.value,
                      aliciIds: [],
                    }))
                  }
                >
                  <option>Duyuru</option>
                  <option>Mesaj</option>
                  <option>Görev</option>
                </select>
              </label>
              {form.tur !== "Duyuru" && (
                <fieldset className={styles.recipientField}>
                  <legend>{form.tur === "Mesaj" ? "Alıcılar" : "Alıcı"}</legend>
                  <div>
                    {people.map((p) => {
                      const id = String(p.ID);
                      const checked = form.aliciIds.includes(id);
                      return (
                        <label key={id}>
                          <input
                            type={form.tur === "Mesaj" ? "checkbox" : "radio"}
                            checked={checked}
                            onChange={() =>
                              setForm((f) => ({
                                ...f,
                                aliciIds:
                                  form.tur === "Mesaj"
                                    ? checked
                                      ? f.aliciIds.filter((x) => x !== id)
                                      : [...f.aliciIds, id]
                                    : [id],
                              }))
                            }
                          />
                          {p.Ad}
                          {id === currentUserId && <small>(Ben)</small>}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              <label>
                Başlık
                <input
                  value={form.baslik}
                  maxLength={220}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, baslik: e.target.value }))
                  }
                />
              </label>
              {form.tur === "Görev" && (
                <label>
                  Termin
                  <input
                    type="date"
                    value={form.terminTarihi}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, terminTarihi: e.target.value }))
                    }
                  />
                </label>
              )}
              <label className={styles.full}>
                İçerik
                <textarea
                  rows={5}
                  value={form.icerik}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, icerik: e.target.value }))
                  }
                />
              </label>
            </div>
            <footer>
              <button onClick={() => setCompose(false)}>Vazgeç</button>
              <button className={styles.primary} onClick={() => void create()}>
                Yayınla
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
