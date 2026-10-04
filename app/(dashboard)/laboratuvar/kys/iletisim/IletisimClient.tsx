"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  ListTodo,
  MessageSquare,
  Pencil,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import styles from "./iletisim.module.css";

type Person = { ID: number | string; Ad: string };
type Read = { kullaniciId: string; okunduAt: string };
type Item = {
  id: number;
  tur: string;
  baslik: string;
  icerik: string;
  olusturanId: string;
  olusturanAd: string;
  aliciId: string;
  aliciAd: string;
  durum: string;
  terminTarihi: string | null;
  baslangicTarihi?: string | null;
  bitisTarihi?: string | null;
  kategori: string | null;
  createdAt: string;
  okundu: boolean;
  okuyanlar?: Read[];
  akış?: Array<{ durum: string; kullaniciAd: string; createdAt: string }>;
};
type Thread = { id: number; participants: Array<{ id: string; ad: string }>; messages: Item[] };
const fmt = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("tr-TR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "-";
const PAGE_SIZE = 8;
const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const taskDateRange = (task: Item): [string, string] | null => {
  const start = String(task.baslangicTarihi || task.terminTarihi || "").slice(0, 10);
  const end = String(task.bitisTarihi || task.terminTarihi || task.baslangicTarihi || "").slice(0, 10);
  return start && end ? [start, end] : null;
};
export default function IletisimClient({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const searchParams = useSearchParams();
  const handledTaskLink = useRef("");
  const [tab, setTab] = useState("Duyuru");
  const [data, setData] = useState<{
    duyurular: Item[];
    mesajlar: Thread[];
    arsivMesajlar: Thread[];
    gorevler: Item[];
  }>({ duyurular: [], mesajlar: [], arsivMesajlar: [], gorevler: [] });
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
    baslangicTarihi: "",
    bitisTarihi: "",
    kategori: "Rutin",
  });
  const [reply, setReply] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [announcementFilter, setAnnouncementFilter] = useState("Tümü");
  const [taskFilter, setTaskFilter] = useState("Tümü");
  const [taskCategoryFilter, setTaskCategoryFilter] = useState("Tümü");
  const [taskOwnershipFilter, setTaskOwnershipFilter] = useState("Tümü");
  const [messageView, setMessageView] = useState<"gelen" | "arsiv">("gelen");
  const [taskView, setTaskView] = useState<"liste" | "takvim">("liste");
  const [calendarView, setCalendarView] = useState<"ay" | "hafta" | "gun">("ay");
  const [calendarTaskId, setCalendarTaskId] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<Item | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ baslik: "", icerik: "", aliciId: "", baslangicTarihi: "", bitisTarihi: "", kategori: "Rutin" });
  const [calendarDate, setCalendarDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  });
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
    const taskId = Number(searchParams.get("gorevId"));
    const isCalendarLink = searchParams.get("sekme") === "gorev";
    if (isCalendarLink) {
      setTab("Görev");
      if (searchParams.get("gorunum") === "takvim") {
        setTaskView("takvim");
        if (window.matchMedia("(max-width: 760px)").matches) setCalendarView("gun");
      }
    }
    const linkKey = isCalendarLink && Number.isInteger(taskId) && taskId > 0
      ? `gorev-${taskId}`
      : "";
    if (!linkKey || loading || handledTaskLink.current === linkKey) return;
    handledTaskLink.current = linkKey;
    if (!data.gorevler.some((task) => task.id === taskId)) return;
    setTaskFilter("Tümü");
    setSearch("");
    setPage(1);
    setCalendarTaskId(taskId);
  }, [data.gorevler, loading, searchParams]);
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
      baslangicTarihi: "",
      bitisTarihi: "",
      kategori: "Rutin",
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
  function openTaskEdit(task: Item) {
    setEditingTask(task);
    setEditTaskForm({ baslik: task.baslik, icerik: task.icerik, aliciId: task.aliciId, baslangicTarihi: String(task.baslangicTarihi || task.terminTarihi || "").slice(0, 10), bitisTarihi: String(task.bitisTarihi || task.terminTarihi || "").slice(0, 10), kategori: task.kategori || "Rutin" });
  }
  async function saveTaskEdit() {
    if (!editingTask) return;
    const response = await fetch("/api/kys/iletisim", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ islem: "gorev-duzenle", id: editingTask.id, ...editTaskForm, aliciAd: peopleById.get(editTaskForm.aliciId) || editTaskForm.aliciId }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) { setError(json.error || "Görev düzenlenemedi."); return; }
    setEditingTask(null); await load();
  }
  async function deleteTask(task: Item) {
    if (!window.confirm(`"${task.baslik}" görevini silmek istediğinize emin misiniz?`)) return;
    setError("");
    const response = await fetch("/api/kys/iletisim", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: task.id }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) { setError(json.error || "Görev silinemedi."); return; }
    setCalendarTaskId(null);
    setEditingTask(null);
    await load();
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
          (taskFilter === "Tümü" || taskFilter === state) &&
          (taskCategoryFilter === "Tümü" || item.kategori === taskCategoryFilter) &&
          (taskOwnershipFilter === "Tümü" ||
            (taskOwnershipFilter === "Bana atanan" && item.aliciId === currentUserId) ||
            (taskOwnershipFilter === "Benim atadıklarım" && item.olusturanId === currentUserId && item.aliciId !== currentUserId))
        );
      }),
    [data.gorevler, search, taskFilter, taskCategoryFilter, taskOwnershipFilter, currentUserId],
  );
  const calendarItems = useMemo(() => [
    ...tasks,
    ...(taskCategoryFilter === "Tümü" ? data.duyurular.filter((item) => item.terminTarihi) : []),
  ], [tasks, data.duyurular, taskCategoryFilter]);
  const calendarTask = calendarTaskId
    ? calendarItems.find((task) => task.id === calendarTaskId) ?? null
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
      count: data.mesajlar.length + data.arsivMesajlar.length,
    },
    {
      id: "Görev",
      label: "Görevler",
      icon: ListTodo,
      count: data.gorevler.length,
    },
  ];
  const days = useMemo<Array<Date | null>>(() => {
    if (calendarView === "gun") return [new Date(calendarDate.getFullYear(), calendarDate.getMonth(), calendarDate.getDate())];
    if (calendarView === "hafta") {
      const start = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), calendarDate.getDate());
      start.setDate(start.getDate() - (start.getDay() === 0 ? 6 : start.getDay() - 1));
      return Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
    }
    const first = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    const count = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
    return [...Array(first.getDay() === 0 ? 6 : first.getDay() - 1).fill(null), ...Array.from({ length: count }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index + 1))];
  }, [calendarDate, calendarView]);
  const calendarWeeks = useMemo(() => {
    if (calendarView === "gun") return [] as Array<Array<Date | null>>;
    const padded = [...days];
    while (padded.length % 7 !== 0) padded.push(null);
    return Array.from({ length: padded.length / 7 }, (_, index) => padded.slice(index * 7, index * 7 + 7));
  }, [days, calendarView]);
  const calendarTitle = useMemo(() => {
    if (calendarView === "ay") return calendarDate.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
    if (calendarView === "gun") return calendarDate.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const dated = days.filter((day): day is Date => Boolean(day));
    return `${dated[0].toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })} – ${dated[6].toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })}`;
  }, [calendarDate, calendarView, days]);
  const moveCalendar = (direction: -1 | 1) => setCalendarDate(current => calendarView === "gun"
    ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction)
    : calendarView === "hafta" ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * 7)
    : new Date(current.getFullYear(), current.getMonth() + direction, 1));
  const printCalendar = () => {
    const printClass = "print-communication-calendar";
    const cleanup = () => document.body.classList.remove(printClass);
    document.body.classList.add(printClass);
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  };
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
              baslangicTarihi: "",
              bitisTarihi: "",
              kategori: "Rutin",
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
        {tab === "Mesaj" && (
          <div className={styles.viewToggle} aria-label="Mesaj görünümü">
            <button className={messageView === "gelen" ? styles.selected : ""} onClick={() => setMessageView("gelen")}>
              <MessageSquare size={15} /> Mesajlar ({data.mesajlar.length})
            </button>
            <button className={messageView === "arsiv" ? styles.selected : ""} onClick={() => setMessageView("arsiv")}>
              <Archive size={15} /> Arşiv ({data.arsivMesajlar.length})
            </button>
          </div>
        )}
        {tab === "Görev" && (
          <>
            <select
              aria-label="Görev durumu"
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
            >
              <option>Tümü</option>
              <option>Atandı</option>
              <option>Termini Geçmiş</option>
              <option>Başladı</option>
              <option>Tamamlandı</option>
            </select>
            <select
              aria-label="Görev kategorisi"
              value={taskCategoryFilter}
              onChange={(e) => setTaskCategoryFilter(e.target.value)}
            >
              <option>Tümü</option>
              <option>Rutin</option>
              <option>Satış</option>
              <option>Rutin Dışı</option>
            </select>
            <select
              aria-label="Görev atama filtresi"
              value={taskOwnershipFilter}
              onChange={(e) => setTaskOwnershipFilter(e.target.value)}
            >
              <option>Tümü</option>
              <option>Bana atanan</option>
              <option>Benim atadıklarım</option>
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
            {taskView === "takvim" && <>
              <div className={`${styles.viewToggle} ${styles.calendarPrintActions}`} aria-label="Takvim görünümü">
                <button className={calendarView === "ay" ? styles.selected : ""} onClick={() => setCalendarView("ay")}>Aylık</button>
                <button className={calendarView === "hafta" ? styles.selected : ""} onClick={() => setCalendarView("hafta")}>Haftalık</button>
                <button className={calendarView === "gun" ? styles.selected : ""} onClick={() => setCalendarView("gun")}>Günlük</button>
              </div>
              <button type="button" className={`${styles.printButton} ${styles.calendarPrintActions}`} onClick={printCalendar}><Printer size={15} />Yazdır</button>
            </>}
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
          {(messageView === "arsiv" ? data.arsivMesajlar : data.mesajlar)
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
              const other = thread.participants
                .filter((participant) => participant.id !== currentUserId)
                .map((participant) => participant.ad)
                .join(", ") || (last.olusturanId === currentUserId ? last.aliciAd : last.olusturanAd);
              const open = expanded.has(thread.id);
              const unread = thread.messages.filter(
                (x) => !x.okundu && x.olusturanId !== currentUserId,
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
                            (x) => !x.okundu && x.olusturanId !== currentUserId,
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
                        <button className={styles.archiveButton} onClick={() => void action({ islem: messageView === "arsiv" ? "mesaj-arsivden-cikar" : "mesaj-arsivle", konusmaId: thread.id })} title={messageView === "arsiv" ? "Konuşmayı arşivden çıkar" : "Konuşmayı arşivle"} aria-label={messageView === "arsiv" ? "Konuşmayı arşivden çıkar" : "Konuşmayı arşivle"}>{messageView === "arsiv" ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
        </div>
      ) : taskView === "takvim" ? (
        <div className={`${styles.calendar} ${calendarView === "hafta" ? styles.weekCalendar : ""} ${calendarView === "gun" ? styles.dayCalendar : ""} ${styles.calendarPrintArea}`}>
          <header>
            <button
              type="button"
              aria-label={calendarView === "gun" ? "Önceki gün" : calendarView === "hafta" ? "Önceki hafta" : "Önceki ay"}
              onClick={() => moveCalendar(-1)}
            >
              <ChevronLeft size={17} />
            </button>
            <strong>{calendarTitle}</strong>
            <button
              type="button"
              aria-label={calendarView === "gun" ? "Sonraki gün" : calendarView === "hafta" ? "Sonraki hafta" : "Sonraki ay"}
              onClick={() => moveCalendar(1)}
            >
              <ChevronRight size={17} />
            </button>
          </header>
          {calendarView !== "gun" && <div className={styles.weekdays}>
            {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>}
          {calendarView === "gun" ? (
            <div className={`${styles.calendarGrid} ${styles.dayCalendarGrid}`}>
              {days.map((day) => day && <div key={dateKey(day)}>
                <b>{day.getDate()}</b>
                <div className={styles.calendarTasks}>
                  {calendarItems.filter((task) => { const range = taskDateRange(task); const key = dateKey(day); return Boolean(range && key >= range[0] && key <= range[1]); }).map((task) => {
                    const overdue = Boolean(task.terminTarihi && new Date(`${task.terminTarihi}T23:59:59`) < new Date() && task.durum !== "Tamamlandı");
                    const state = task.tur === "Duyuru" ? "Duyuru" : overdue ? "Gecikti" : task.durum === "Atandı" ? "Bekliyor" : task.durum;
                    return <button key={task.id} className={`${styles.calendarTask} ${styles[`calendar${state}`] || ""} ${task.kategori ? styles[`calendarCategory${task.kategori.replace(/\s/g, "")}`] || "" : ""}`} title={`${task.baslik} · ${overdue ? "Termini Geçmiş" : task.durum}`} onClick={() => { setCalendarTaskId(task.id); if (!task.okundu && task.aliciId === currentUserId) void action({ islem: "okundu", id: task.id }); }}>
                      {task.tur === "Duyuru" ? "Duyuru · " : task.kategori ? `${task.kategori} · ` : ""}{task.baslik}
                      {task.tur === "Görev" && <><span className={styles.dailyAssignee}>Atanan: {task.aliciAd || peopleById.get(task.aliciId) || "Belirtilmemiş"}</span><span className={styles.dailyDescription}>{task.icerik || "Açıklama girilmemiş."}</span></>}
                    </button>;
                  })}
                </div>
              </div>)}
            </div>
          ) : (
            <div className={styles.calendarWeeks}>
              {calendarWeeks.map((weekDays, weekIndex) => {
                const datedDays = weekDays.filter((day): day is Date => Boolean(day));
                const weekFirst = dateKey(datedDays[0]);
                const weekLast = dateKey(datedDays[datedDays.length - 1]);
                const weekTasks = calendarItems.flatMap((task) => { const range = taskDateRange(task); return range && range[0] <= weekLast && range[1] >= weekFirst ? [{ task, range }] : []; })
                  .map((entry) => ({ ...entry, startKey: entry.range[0] < weekFirst ? weekFirst : entry.range[0], endKey: entry.range[1] > weekLast ? weekLast : entry.range[1] }))
                  .sort((a, b) => a.startKey.localeCompare(b.startKey) || b.endKey.localeCompare(a.endKey));
                const occupiedColumns: boolean[][] = [];
                const placedTasks = weekTasks.map((entry) => {
                  const startColumn = weekDays.findIndex((day) => Boolean(day && dateKey(day) === entry.startKey));
                  const endColumn = weekDays.findIndex((day) => Boolean(day && dateKey(day) === entry.endKey));
                  let lane = 0;
                  while (occupiedColumns[lane]?.slice(startColumn, endColumn + 1).some(Boolean)) lane += 1;
                  occupiedColumns[lane] ||= Array(7).fill(false);
                  for (let column = startColumn; column <= endColumn; column += 1) occupiedColumns[lane][column] = true;
                  return { ...entry, startColumn, endColumn, lane };
                });
                const laneCount = Math.max(placedTasks.reduce((count, item) => Math.max(count, item.lane + 1), 0), 1);
                return <div className={styles.calendarWeekRow} key={`week-${weekIndex}`}>
                  <div className={styles.calendarWeekDays} style={{ minHeight: `${Math.max(calendarView === "hafta" ? 360 : 132, 46 + laneCount * 25)}px` }}>
                    {weekDays.map((day, dayIndex) => <div key={day ? dateKey(day) : `empty-${weekIndex}-${dayIndex}`} className={!day ? styles.blank : ""}>{day && <b>{day.getDate()}{calendarView === "hafta" ? ` ${day.toLocaleDateString("tr-TR", { month: "short" })}` : ""}</b>}</div>)}
                    <div className={styles.calendarSpanBars} style={{ gridTemplateRows: `repeat(${laneCount}, 22px)` }}>
                      {placedTasks.map(({ task, range, startColumn, endColumn, lane }) => {
                        const overdue = Boolean(task.terminTarihi && new Date(`${task.terminTarihi}T23:59:59`) < new Date() && task.durum !== "Tamamlandı");
                        const state = task.tur === "Duyuru" ? "Duyuru" : overdue ? "Gecikti" : task.durum === "Atandı" ? "Bekliyor" : task.durum;
                        return <button key={task.id} className={`${styles.calendarTask} ${styles.calendarSpanTask} ${styles[`calendar${state}`] || ""} ${task.kategori ? styles[`calendarCategory${task.kategori.replace(/\s/g, "")}`] || "" : ""}`} style={{ gridColumn: `${startColumn + 1} / ${endColumn + 2}`, gridRow: lane + 1 }} title={`${task.baslik} · ${range[0]} – ${range[1]}`} onClick={() => { setCalendarTaskId(task.id); if (!task.okundu && task.aliciId === currentUserId) void action({ islem: "okundu", id: task.id }); }}>
                          {task.tur === "Duyuru" ? "Duyuru · " : task.kategori ? `${task.kategori} · ` : ""}{task.baslik}
                        </button>;
                      })}
                    </div>
                  </div>
                </div>;
              })}
            </div>
          )}
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
                    {calendarTask.tur === "Duyuru" ? `Duyuru · ${calendarTask.olusturanAd}` : `${calendarTask.aliciAd} · Atayan ${calendarTask.olusturanAd}`}
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
              {calendarTask.tur === "Görev" && (
                <div className={styles.taskAssignment}>
                  <Users size={22} aria-hidden="true" />
                  <span><small>Görevin atandığı kişi</small><strong>{calendarTask.aliciAd || peopleById.get(calendarTask.aliciId) || "Belirtilmemiş"}</strong><small>Atayan: {calendarTask.olusturanAd}</small></span>
                </div>
              )}
              <section className={styles.calendarDetailBody}>
                <h3>Açıklama</h3>
                <p>{calendarTask.icerik || "Açıklama girilmemiş."}</p>
              </section>
              <div className={styles.calendarDetailMeta}>
                <span>
                  <small>{calendarTask.tur === "Duyuru" ? "Tür" : "Durum"}</small>
                  <strong>{calendarTask.tur === "Duyuru" ? "Duyuru" : calendarTask.durum}</strong>
                </span>
                {calendarTask.kategori && <span><small>Kategori</small><strong className={`${styles.categoryBadge} ${styles[`category${calendarTask.kategori.replace(/\s/g, "")}`] || ""}`}>{calendarTask.kategori}</strong></span>}
                <span>
                  <small>{calendarTask.tur === "Duyuru" ? "Tarih" : "Termin"}</small>
                  <strong>{calendarTask.tur === "Görev"
                    ? `${new Date(calendarTask.baslangicTarihi || calendarTask.terminTarihi || "").toLocaleDateString("tr-TR")} – ${new Date(calendarTask.bitisTarihi || calendarTask.terminTarihi || "").toLocaleDateString("tr-TR")}`
                    : calendarTask.terminTarihi ? new Date(calendarTask.terminTarihi).toLocaleDateString("tr-TR") : "Yok"}</strong>
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
                {calendarTask.tur === "Görev" && calendarTask.olusturanId === currentUserId && calendarTask.durum !== "Tamamlandı" && (
                  <><button className={styles.editTask} onClick={() => openTaskEdit(calendarTask)}><Pencil size={15} />Düzenle</button><button className={styles.deleteTask} onClick={() => void deleteTask(calendarTask)}><Trash2 size={15} />Sil</button></>
                )}
                {calendarTask.tur === "Görev" && calendarTask.durum === "Atandı" &&
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
                {calendarTask.tur === "Görev" && calendarTask.durum === "Başladı" &&
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
                    <strong>{item.baslik}{item.kategori && <em className={`${styles.categoryBadge} ${styles[`category${item.kategori.replace(/\s/g, "")}`] || ""}`}>{item.kategori}</em>}</strong>
                    <small>
                      {item.aliciAd} · Atayan {item.olusturanAd}
                    </small>
                  </span>
                  <span className={styles.taskStatus}>
                    {overdue ? "Termini Geçmiş" : item.durum}
                  </span>
                  <time>
                    {item.terminTarihi
                      ? `${new Date(item.baslangicTarihi || item.terminTarihi).toLocaleDateString("tr-TR")} – ${new Date(item.bitisTarihi || item.terminTarihi).toLocaleDateString("tr-TR")}`
                      : "Termin yok"}
                  </time>
                  <ChevronDown
                    className={open ? styles.rotated : ""}
                    size={17}
                  />
                </button>
                {item.olusturanId === currentUserId && item.durum !== "Tamamlandı" && (
                  <div className={styles.taskQuickActions}>
                    <button type="button" onClick={() => openTaskEdit(item)} aria-label={`${item.baslik} görevini düzenle`} title="Düzenle"><Pencil size={14} /></button>
                    <button type="button" className={styles.quickDelete} onClick={() => void deleteTask(item)} aria-label={`${item.baslik} görevini sil`} title="Sil"><Trash2 size={14} /></button>
                  </div>
                )}
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
                  <legend>Alıcılar</legend>
                  <div>
                    {people.map((p) => {
                      const id = String(p.ID);
                      const checked = form.aliciIds.includes(id);
                      return (
                        <label key={id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setForm((f) => ({
                                ...f,
                                aliciIds: checked
                                  ? f.aliciIds.filter((x) => x !== id)
                                  : [...f.aliciIds, id],
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
              {form.tur === "Görev" && <label>Kategori<select value={form.kategori} onChange={(e) => setForm((f) => ({ ...f, kategori: e.target.value }))}><option>Rutin</option><option>Satış</option><option>Rutin Dışı</option></select></label>}
              {form.tur === "Görev" && <>
                <label>Başlama tarihi<input required type="date" value={form.baslangicTarihi} onChange={(e) => setForm((f) => ({ ...f, baslangicTarihi: e.target.value }))} /></label>
                <label>Bitiş tarihi<input required type="date" min={form.baslangicTarihi || undefined} value={form.bitisTarihi} onChange={(e) => setForm((f) => ({ ...f, bitisTarihi: e.target.value, terminTarihi: e.target.value }))} /></label>
              </>}
              {form.tur === "Duyuru" && (
                <label>
                  Takvim tarihi (isteğe bağlı)
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
      {editingTask && (
        <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingTask(null); }}>
          <div className={`${styles.modal} ${styles.taskEditModal}`} role="dialog" aria-modal="true" aria-labelledby="task-edit-title">
            <header><h2 id="task-edit-title">Görevi düzenle</h2><button onClick={() => setEditingTask(null)} aria-label="Kapat">×</button></header>
            <div className={styles.form}>
              <label>Başlık<input value={editTaskForm.baslik} onChange={(event) => setEditTaskForm((form) => ({ ...form, baslik: event.target.value }))} /></label>
              <label>Alıcı<select value={editTaskForm.aliciId} onChange={(event) => setEditTaskForm((form) => ({ ...form, aliciId: event.target.value }))}>{people.map((person) => <option key={String(person.ID)} value={String(person.ID)}>{person.Ad}</option>)}</select></label>
              <label>Başlama tarihi<input required type="date" value={editTaskForm.baslangicTarihi} onChange={(event) => setEditTaskForm((form) => ({ ...form, baslangicTarihi: event.target.value }))} /></label>
              <label>Bitiş tarihi<input required type="date" min={editTaskForm.baslangicTarihi || undefined} value={editTaskForm.bitisTarihi} onChange={(event) => setEditTaskForm((form) => ({ ...form, bitisTarihi: event.target.value }))} /></label>
              <label>Kategori<select value={editTaskForm.kategori} onChange={(event) => setEditTaskForm((form) => ({ ...form, kategori: event.target.value }))}><option>Rutin</option><option>Satış</option><option>Rutin Dışı</option></select></label>
              <label className={styles.full}>Açıklama<textarea rows={5} value={editTaskForm.icerik} onChange={(event) => setEditTaskForm((form) => ({ ...form, icerik: event.target.value }))} /></label>
            </div>
            <footer><button onClick={() => setEditingTask(null)}>Vazgeç</button><button className={styles.primary} onClick={() => void saveTaskEdit()}>Güncelle</button></footer>
          </div>
        </div>
      )}
    </div>
  );
}
