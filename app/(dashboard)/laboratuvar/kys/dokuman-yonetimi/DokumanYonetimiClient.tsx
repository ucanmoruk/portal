"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Bold,
  CheckCircle2,
  ChevronDown,
  Circle,
  Eye,
  Highlighter,
  History,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Lock,
  PenLine,
  Printer,
  RotateCcw,
  Save,
  Send,
  Table2,
  Underline,
  Undo2,
  ExternalLink,
  X,
  XCircle,
} from "lucide-react";
import tableStyles from "@/app/styles/table.module.css";
import styles from "./dokumanYonetimi.module.css";
import {
  BOS_YETKI,
  DOKUMAN_TURLERI,
  errorMessage,
  formatDate,
  formatDateTime,
  statusTone,
  type DokumanDetay,
  type DokumanYetki,
} from "./dokumanTypes";

type Kullanici = { ID: number | string; Ad: string };
type Aksiyon =
  | "onaya-gonder"
  | "yayin-onayi"
  | "reddet"
  | "revizyon-baslat"
  | "arsivle"
  | "arsivden-cikar";

type AksiyonTanim = {
  baslik: string;
  aciklama: string;
  notEtiketi: string;
  notZorunlu: boolean;
  yururlukSor?: boolean;
  onayEtiketi: string;
};

const AKSIYONLAR: Record<Aksiyon, AksiyonTanim> = {
  "onaya-gonder": {
    baslik: "Onaya gönder",
    aciklama: "Doküman kilitlenecek ve onaylayan kişinin yayına alma onayına düşecek.",
    notEtiketi: "Onay notu (opsiyonel)",
    notZorunlu: false,
    onayEtiketi: "Gönder",
  },
  "yayin-onayi": {
    baslik: "Yayına al",
    aciklama: "Doküman yürürlüğe girecek ve bu sürüm revizyon geçmişine kaydedilecek.",
    notEtiketi: "Yayın notu (opsiyonel)",
    notZorunlu: false,
    yururlukSor: true,
    onayEtiketi: "Yayına al",
  },
  reddet: {
    baslik: "Revizyona geri gönder",
    aciklama: "Doküman hazırlayana geri döner ve yeniden düzenlenebilir hâle gelir.",
    notEtiketi: "Geri gönderme gerekçesi",
    notZorunlu: true,
    onayEtiketi: "Geri gönder",
  },
  "revizyon-baslat": {
    baslik: "Revizyon başlat",
    aciklama: "Revizyon numarası bir artar ve doküman yeniden düzenlenebilir hâle gelir.",
    notEtiketi: "Revizyon gerekçesi",
    notZorunlu: true,
    onayEtiketi: "Revizyonu başlat",
  },
  arsivle: {
    baslik: "Arşive al",
    aciklama: "Doküman yürürlükten kaldırılır ve arşive taşınır.",
    notEtiketi: "Arşivleme gerekçesi",
    notZorunlu: true,
    onayEtiketi: "Arşive al",
  },
  "arsivden-cikar": {
    baslik: "Arşivden çıkar",
    aciklama: "Doküman yeniden düzenlenebilir hâle gelir; yayın için onay akışından geçmesi gerekir.",
    notEtiketi: "Açıklama (opsiyonel)",
    notZorunlu: false,
    onayEtiketi: "Arşivden çıkar",
  },
};

const FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Varsayılan", value: "-apple-system, BlinkMacSystemFont, \"SF Pro Display\", \"SF Pro Text\", \"Helvetica Neue\", Arial, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Times New Roman", value: "\"Times New Roman\", Times, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "\"Trebuchet MS\", sans-serif" },
  { label: "Courier New", value: "\"Courier New\", Courier, monospace" },
];

function ToolButton({ title, onRun, disabled, children }: { title: string; onRun: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={title} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={onRun}>
      {children}
    </button>
  );
}

function TableMenuItem({ label, onRun, onDone }: { label: string; onRun: () => void; onDone: () => void }) {
  return (
    <button
      type="button"
      // preventDefault: tıklama editörün odağını/seçimini bozmasın — aksi hâlde
      // aktif hücre referansı geçerli kalsa da imleç konumlandırma çalışmaz.
      onMouseDown={event => event.preventDefault()}
      onClick={() => { onRun(); onDone(); }}
    >
      {label}
    </button>
  );
}

function slugifyHeading(value: string, index: number) {
  const slug = value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}-${index + 1}` : `baslik-${index + 1}`;
}

function placeCaretAtEnd(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function placeCaretInside(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function sameSections(a: Array<{ id: string; title: string }>, b: Array<{ id: string; title: string }>) {
  return a.length === b.length && a.every((item, index) => item.id === b[index].id && item.title === b[index].title);
}

function topLevelBlockFromNode(editor: HTMLElement, source: Node | null) {
  let node: Node | null = source;
  while (node && node.parentNode && node.parentNode !== editor) node = node.parentNode;
  if (!node || node.parentNode !== editor) return null;
  return node instanceof HTMLElement ? node : null;
}

function tableCellFromNode(editor: HTMLElement, source: Node | null) {
  const element = source instanceof HTMLElement ? source : source?.parentElement || null;
  if (!element || !editor.contains(element)) return null;
  const cell = element.closest("th, td");
  return cell instanceof HTMLTableCellElement && editor.contains(cell) ? cell : null;
}

export default function DokumanYonetimiClient({ documentId }: { documentId: number }) {
  const [doc, setDoc] = useState<DokumanDetay | null>(null);
  const [yetki, setYetki] = useState<DokumanYetki>(BOS_YETKI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"icerik" | "kunye" | "akis" | "revizyon" | "gecmis">("icerik");
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveInfo, setSaveInfo] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sections, setSections] = useState<Array<{ id: string; title: string }>>([]);
  const [aksiyonModal, setAksiyonModal] = useState<Aksiyon | null>(null);
  const [aksiyonNot, setAksiyonNot] = useState("");
  const [aksiyonMaddeNo, setAksiyonMaddeNo] = useState("");
  const [aksiyonYururluk, setAksiyonYururluk] = useState("");
  const [aksiyonHata, setAksiyonHata] = useState("");
  const [aksiyonBusy, setAksiyonBusy] = useState(false);
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([]);
  const [kunye, setKunye] = useState({
    kod: "", baslik: "", tur: "Prosedür", ozet: "", yururlukTarihi: "",
    hazirlayanId: "", hazirlayanAd: "", onaylayanId: "", onaylayanAd: "",
  });
  const [yayinDokumanlari, setYayinDokumanlari] = useState<DokumanDetay[]>([]);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [revizyonOnizleme, setRevizyonOnizleme] = useState<{ etiket: string; icerik: string; aciklama: string } | null>(null);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const headingSeqRef = useRef(0);
  const savedRangeRef = useRef<Range | null>(null);
  const activeBlockRef = useRef<HTMLElement | null>(null);
  const activeCellRef = useRef<HTMLTableCellElement | null>(null);
  const loadedKeyRef = useRef("");
  // Sekme değiştiğinde editör DOM'dan kalkar; kaydedilmemiş içerik burada tutulur
  const draftRef = useRef<string | null>(null);
  const tableMenuRef = useRef<HTMLDivElement | null>(null);

  const canEdit = Boolean(doc?.duzenlenebilir && yetki.duzenle);

  // ── Veri ───────────────────────────────────────────────────────────────────

  const fetchDoc = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/kys/dokumanlar/${documentId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Doküman alınamadı.");
      setDoc(json.data);
      setYetki(json.yetki || BOS_YETKI);
    } catch (e: unknown) {
      setError(errorMessage(e, "Doküman alınamadı."));
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { void fetchDoc(); }, [fetchDoc]);

  // Doküman/revizyon değiştiğinde editörü bir kez doldur (React her render'da
  // ezmesin diye imperatif; aksi hâlde yazarken imleç başa atlar).
  useEffect(() => {
    if (!doc) return;
    const key = `${doc.id}-${doc.revizyon}-${doc.updatedAt || ""}`;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    draftRef.current = null;
    const editor = editorRef.current;
    if (editor) {
      editor.innerHTML = doc.icerik || "";
      refreshSections();
    }
    setDirty(false);
    setEditing(false);
    if (doc.hasDosya) setActiveTab("kunye");
    setKunye({
      kod: doc.kod,
      baslik: doc.baslik,
      tur: doc.tur,
      ozet: doc.ozet,
      yururlukTarihi: doc.yururlukTarihi || "",
      hazirlayanId: doc.hazirlayanId,
      hazirlayanAd: doc.hazirlayanAd,
      onaylayanId: doc.onaylayanId,
      onaylayanAd: doc.onaylayanAd,
    });
     
  }, [doc]);

  // İçerik sekmesine dönüldüğünde editör yeniden monte olur → içeriği geri yaz
  useEffect(() => {
    if (activeTab !== "icerik" || !doc) return;
    const editor = editorRef.current;
    if (editor && !editor.innerHTML.trim()) {
      editor.innerHTML = draftRef.current ?? doc.icerik ?? "";
      refreshSections();
    }
     
  }, [activeTab, doc]);

  // Hazırlayan/onaylayan seçimleri için personel listesi — künye
  // salt okunur olsa bile mevcut isimler doğru gösterilebilsin diye her zaman çekilir.
  useEffect(() => {
    fetch("/api/kullanicilar")
      .then(r => r.json())
      .then(j => setKullanicilar(j.data || []))
      .catch(() => { /* liste alınamazsa mevcut isim salt metin olarak gösterilir */ });
  }, []);

  useEffect(() => {
    fetch("/api/kys/dokumanlar?durum=Yayında&limit=200&sort=kod-asc")
      .then(r => r.json())
      .then(j => setYayinDokumanlari(j.data || []))
      .catch(() => setYayinDokumanlari([]));
  }, []);

  // Kaydedilmemiş değişiklikle sayfadan ayrılma uyarısı
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Ctrl/Cmd+S ile kaydet
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (canEdit && dirty && !saving) void save();
      }
      if (event.key === "Escape") {
        if (linkModalOpen) setLinkModalOpen(false);
        else if (revizyonOnizleme) setRevizyonOnizleme(null);
        else if (previewOpen) setPreviewOpen(false);
        else if (aksiyonModal && !aksiyonBusy) setAksiyonModal(null);
        else if (tableMenuOpen) setTableMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, dirty, saving, previewOpen, aksiyonModal, aksiyonBusy, revizyonOnizleme, tableMenuOpen, linkModalOpen]);

  // Tablo menüsünün dışına tıklanınca kapat
  useEffect(() => {
    if (!tableMenuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (tableMenuRef.current && !tableMenuRef.current.contains(event.target as Node)) {
        setTableMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [tableMenuOpen]);

  // ── Editör ─────────────────────────────────────────────────────────────────

  function refreshSections() {
    const editor = editorRef.current;
    if (!editor) return;
    const headings = Array.from(editor.querySelectorAll("h2, h3, h4"));
    headings.forEach((heading, index) => {
      const title = heading.textContent?.trim() || `Başlık ${index + 1}`;
      if (!heading.id) heading.id = slugifyHeading(title, index);
    });
    const next = headings.map((heading, index) => ({
      id: heading.id || `baslik-${index + 1}`,
      title: heading.textContent?.trim() || `Başlık ${index + 1}`,
    }));
    setSections(prev => (sameSections(prev, next) ? prev : next));
  }

  function markDirty() {
    rememberEditorSelection();
    draftRef.current = editorRef.current?.innerHTML ?? draftRef.current;
    setDirty(true);
    setSaveInfo("");
  }

  function rememberEditorSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedRangeRef.current = range.cloneRange();
    activeBlockRef.current = topLevelBlockFromNode(editor, range.commonAncestorContainer) || activeBlockRef.current;
    activeCellRef.current = tableCellFromNode(editor, range.commonAncestorContainer) || activeCellRef.current;
  }

  function restoreEditorSelection() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    const savedRange = savedRangeRef.current;
    if (selection && savedRange && editor.contains(savedRange.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
  }

  function currentSelectionInsideEditor() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return editor.contains(range.commonAncestorContainer) ? range : null;
  }

  function insertionBlockInsideEditor() {
    const editor = editorRef.current;
    if (!editor) return null;
    if (activeBlockRef.current && editor.contains(activeBlockRef.current)) return activeBlockRef.current;
    const range = currentSelectionInsideEditor();
    return topLevelBlockFromNode(editor, range?.commonAncestorContainer || null) || editor.lastElementChild;
  }

  function insertBlockNodes(nodes: Node[], focusNode?: HTMLElement) {
    const editor = editorRef.current;
    if (!editor) return;
    const insertionBlock = insertionBlockInsideEditor();
    if (insertionBlock && insertionBlock.parentElement === editor) insertionBlock.after(...nodes);
    else nodes.forEach(node => editor.appendChild(node));
    if (focusNode) placeCaretInside(focusNode);
    markDirty();
  }

  function ensureEditing() {
    if (!canEdit) return false;
    if (!editing) {
      setEditing(true);
      const editor = editorRef.current;
      if (editor) editor.setAttribute("contenteditable", "true");
    }
    return true;
  }

  function runCommand(command: string, value?: string) {
    if (!ensureEditing()) return;
    restoreEditorSelection();
    // styleWithCSS: fontName gibi komutların eski <font> yerine <span style="...">
    // üretmesini sağlar — sanitizer sadece CSS tabanlı biçimlendirmeyi tanıyor.
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    markDirty();
  }

  function applyFontFamily(fontFamily: string) {
    if (!fontFamily) return;
    const range = currentSelectionInsideEditor() || savedRangeRef.current;
    if (!range || range.collapsed) {
      window.alert("Önce yazı tipini değiştirecek metni seçin.");
      return;
    }
    runCommand("fontName", fontFamily);
  }

  function nextHeadingNumber(level: 2 | 3 | 4) {
    const headings = Array.from(editorRef.current?.querySelectorAll("h2, h3, h4") || []);
    const numbers = headings
      .map(heading => heading.textContent?.trim().match(/^(\d+(?:\.\d+)*)/)?.[1])
      .filter(Boolean) as string[];
    if (level === 2) {
      const max = numbers.reduce((acc, value) => Math.max(acc, Number(value.split(".")[0]) || 0), 0);
      return `${max + 1}.`;
    }
    const insertionBlock = insertionBlockInsideEditor();
    const precedingHeadings = insertionBlock
      ? headings.filter(heading => (
          heading === insertionBlock ||
          Boolean(heading.compareDocumentPosition(insertionBlock) & Node.DOCUMENT_POSITION_FOLLOWING)
        ))
      : headings;
    const lastH2Element = [...precedingHeadings].reverse().find(heading => heading.tagName === "H2");
    const lastH2 = lastH2Element?.textContent?.trim().match(/^(\d+)/)?.[1] || "1";
    if (level === 3) {
      const followingHeadings = lastH2Element ? headings.slice(headings.indexOf(lastH2Element) + 1) : headings;
      const nextMainHeadingIndex = followingHeadings.findIndex(heading => heading.tagName === "H2");
      const siblingHeadings = nextMainHeadingIndex >= 0 ? followingHeadings.slice(0, nextMainHeadingIndex) : followingHeadings;
      const sameSectionNumbers = siblingHeadings
        .filter(heading => heading.tagName !== "H2")
        .map(heading => heading.textContent?.trim().match(/^(\d+(?:\.\d+)*)/)?.[1])
        .filter(Boolean) as string[];
      const max = sameSectionNumbers
        .filter(value => value.startsWith(`${lastH2}.`) && value.split(".").length === 2)
        .reduce((acc, value) => Math.max(acc, Number(value.split(".")[1]) || 0), 0);
      return `${lastH2}.${max + 1}`;
    }
    const lastH3Element = [...precedingHeadings].reverse().find(heading => heading.tagName === "H3");
    const lastH3 = lastH3Element?.textContent?.trim().match(/^(\d+\.\d+)/)?.[1] || `${lastH2}.1`;
    const followingHeadings = lastH3Element ? headings.slice(headings.indexOf(lastH3Element) + 1) : headings;
    const nextParentHeadingIndex = followingHeadings.findIndex(heading => ["H2", "H3"].includes(heading.tagName));
    const siblingHeadings = nextParentHeadingIndex >= 0 ? followingHeadings.slice(0, nextParentHeadingIndex) : followingHeadings;
    const sameSectionNumbers = siblingHeadings
      .filter(heading => !["H2", "H3"].includes(heading.tagName))
      .map(heading => heading.textContent?.trim().match(/^(\d+(?:\.\d+)*)/)?.[1])
      .filter(Boolean) as string[];
    const max = sameSectionNumbers
      .filter(value => value.startsWith(`${lastH3}.`) && value.split(".").length === 3)
      .reduce((acc, value) => Math.max(acc, Number(value.split(".")[2]) || 0), 0);
    return `${lastH3}.${max + 1}`;
  }

  function insertHeading(level: 2 | 3 | 4) {
    if (!ensureEditing()) return;
    const editor = editorRef.current;
    if (!editor) return;
    const number = nextHeadingNumber(level);
    const selectedRange = currentSelectionInsideEditor() || savedRangeRef.current;
    if (selectedRange && !selectedRange.collapsed && editor.contains(selectedRange.commonAncestorContainer)) {
      restoreEditorSelection();
      document.execCommand("formatBlock", false, `h${level}`);
      const selection = window.getSelection();
      const block = topLevelBlockFromNode(editor, selection?.anchorNode || null);
      if (block) {
        const currentText = block.textContent?.trim() || "";
        if (!/^\d+(?:\.\d+)*\.?\s/.test(currentText)) block.textContent = `${number} ${currentText}`;
        headingSeqRef.current += 1;
        block.id = slugifyHeading(block.textContent || currentText, headingSeqRef.current);
      }
      markDirty();
      refreshSections();
      return;
    }
    const label = level === 2 ? "Yeni başlık" : level === 3 ? "Yeni alt başlık" : "Yeni alt alt başlık";
    headingSeqRef.current += 1;
    const heading = document.createElement(`h${level}`);
    heading.id = slugifyHeading(`${number} ${label}`, headingSeqRef.current);
    heading.textContent = `${number} ${label}`;
    const paragraph = document.createElement("p");
    paragraph.innerHTML = "<br>";
    const insertionBlock = insertionBlockInsideEditor();
    if (insertionBlock && insertionBlock.parentElement === editor) insertionBlock.after(heading, paragraph);
    else editor.append(heading, paragraph);
    placeCaretInside(paragraph);
    markDirty();
    refreshSections();
  }

  function readPositiveNumber(message: string, fallback: number, max: number) {
    const value = window.prompt(message, String(fallback));
    if (value === null) return null;
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(Math.round(parsed), max);
  }

  function activeTableCell() {
    const editor = editorRef.current;
    const cell = activeCellRef.current;
    if (editor && cell && editor.contains(cell)) return cell;
    const range = currentSelectionInsideEditor();
    return editor ? tableCellFromNode(editor, range?.commonAncestorContainer || null) : null;
  }

  function requireCell(message = "Önce tabloda bir hücreye tıklayın.") {
    const cell = activeTableCell();
    if (!cell) { window.alert(message); return null; }
    return cell;
  }

  function insertTable() {
    if (!ensureEditing()) return;
    const rowCount = readPositiveNumber("Kaç satır olsun?", 3, 30);
    if (!rowCount) return;
    const columnCount = readPositiveNumber("Kaç sütun olsun?", 3, 12);
    if (!columnCount) return;
    const table = document.createElement("table");
    const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
      const tag = rowIndex === 0 ? "th" : "td";
      const cells = Array.from({ length: columnCount }, () => `<${tag}>${rowIndex === 0 ? "Başlık" : ""}</${tag}>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    table.innerHTML = `<tbody>${rows}</tbody>`;
    const paragraph = document.createElement("p");
    paragraph.innerHTML = "<br>";
    insertBlockNodes([table, paragraph], paragraph);
  }

  function addTableRow() {
    if (!ensureEditing()) return;
    const cell = requireCell();
    const row = cell?.parentElement;
    if (!cell || !(row instanceof HTMLTableRowElement)) return;
    const nextRow = row.cloneNode(false) as HTMLTableRowElement;
    Array.from(row.cells).forEach(sourceCell => {
      // Başlık satırının altına veri satırı ekle
      const nextCell = document.createElement(sourceCell.tagName === "TH" ? "td" : sourceCell.tagName.toLowerCase());
      nextCell.innerHTML = "<br>";
      nextRow.appendChild(nextCell);
    });
    row.after(nextRow);
    placeCaretInside(nextRow.cells[0]);
    markDirty();
  }

  function addTableColumn() {
    if (!ensureEditing()) return;
    const cell = requireCell();
    const table = cell?.closest("table");
    if (!cell || !table) return;
    const columnIndex = cell.cellIndex;
    Array.from(table.rows).forEach(row => {
      const sourceCell = row.cells[columnIndex] || row.cells[row.cells.length - 1];
      const nextCell = document.createElement(sourceCell?.tagName.toLowerCase() || "td");
      nextCell.innerHTML = "<br>";
      if (row.cells[columnIndex]) row.cells[columnIndex].after(nextCell);
      else row.appendChild(nextCell);
    });
    markDirty();
  }

  function removeTableRow() {
    if (!ensureEditing()) return;
    const cell = requireCell();
    const row = cell?.parentElement;
    const table = cell?.closest("table");
    if (!cell || !(row instanceof HTMLTableRowElement) || !table) return;
    if (table.rows.length <= 1) { window.alert("Tablonun son satırı silinemez."); return; }
    row.remove();
    activeCellRef.current = null;
    markDirty();
  }

  function removeTableColumn() {
    if (!ensureEditing()) return;
    const cell = requireCell();
    const table = cell?.closest("table");
    if (!cell || !table) return;
    if ((table.rows[0]?.cells.length || 0) <= 1) { window.alert("Tablonun son sütunu silinemez."); return; }
    const columnIndex = cell.cellIndex;
    Array.from(table.rows).forEach(row => row.cells[columnIndex]?.remove());
    activeCellRef.current = null;
    markDirty();
  }

  function setTableColumnWidth() {
    if (!ensureEditing()) return;
    const cell = requireCell("Önce genişliğini değiştireceğiniz sütundaki bir hücreye tıklayın.");
    const table = cell?.closest("table");
    if (!cell || !table) return;
    const width = readPositiveNumber("Sütun genişliği yüzde kaç olsun?", 25, 100);
    if (!width) return;
    const columnIndex = cell.cellIndex;
    Array.from(table.rows).forEach(row => {
      const targetCell = row.cells[columnIndex];
      if (targetCell) targetCell.style.width = `${width}%`;
    });
    markDirty();
  }

  function setTableRowHeight() {
    if (!ensureEditing()) return;
    const cell = requireCell("Önce yüksekliğini değiştireceğiniz satırdaki bir hücreye tıklayın.");
    const row = cell?.parentElement;
    if (!cell || !(row instanceof HTMLTableRowElement)) return;
    const height = readPositiveNumber("Satır yüksekliği kaç px olsun?", 34, 200);
    if (!height) return;
    row.style.height = `${height}px`;
    markDirty();
  }

  function insertImageFromUrl(src: string) {
    if (!ensureEditing()) return;
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = src;
    image.alt = "Doküman görseli";
    const caption = document.createElement("figcaption");
    caption.textContent = "Görsel açıklaması";
    figure.append(image, caption);
    const paragraph = document.createElement("p");
    paragraph.innerHTML = "<br>";
    insertBlockNodes([figure, paragraph], caption);
  }

  function handleImageFile(file: File) {
    // 4 MB üstü görseller doküman gövdesini şişirir (data URI olarak saklanıyor)
    if (file.size > 4 * 1024 * 1024) {
      window.alert("Görsel 4 MB'dan küçük olmalı. Lütfen görseli küçültüp tekrar deneyin.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") insertImageFromUrl(reader.result); };
    reader.readAsDataURL(file);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (!canEdit) { event.preventDefault(); return; }
    const imageItem = Array.from(event.clipboardData.items).find(item => item.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) { event.preventDefault(); handleImageFile(file); return; }
    }
    // Word/web kaynaklı kalın, italik, liste, tablo ve benzeri zengin biçimi koru.
    const html = event.clipboardData.getData("text/html");
    if (html) {
      event.preventDefault();
      document.execCommand("insertHTML", false, html);
    }
    requestAnimationFrame(() => { markDirty(); refreshSections(); });
  }

  function createPublishedDocumentLink(targetId: string) {
    if (!ensureEditing()) return;
    const range = currentSelectionInsideEditor() || savedRangeRef.current;
    if (!range || range.collapsed) {
      window.alert("Önce bağlantı verilecek metni seçin.");
      return;
    }
    const target = yayinDokumanlari.find(item => String(item.id) === targetId);
    if (!target) return;
    const url = target.hasDosya
      ? `/api/kys/dokumanlar/${target.id}/dosya`
      : `/laboratuvar/kys/dokuman-yonetimi/${target.id}/onizleme`;
    restoreEditorSelection();
    document.execCommand("createLink", false, url);
    const selection = window.getSelection();
    const anchor = (selection?.anchorNode instanceof HTMLElement ? selection.anchorNode : selection?.anchorNode?.parentElement)?.closest("a");
    anchor?.setAttribute("target", "_blank");
    anchor?.setAttribute("rel", "noopener noreferrer");
    markDirty();
    setLinkModalOpen(false);
    setLinkSearch("");
  }

  function handleDocumentLinkClick(event: React.MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const anchor = target.closest("a");
    if (!anchor?.href || editing) return;
    event.preventDefault();
    window.open(anchor.href, "_blank", "noopener,noreferrer");
  }

  function scrollToSection(id: string) {
    editorRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleEditing() {
    if (!canEdit) return;
    if (editing) { setEditing(false); return; }
    setEditing(true);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      placeCaretAtEnd(editor);
      rememberEditorSelection();
    });
  }

  // ── Kaydetme / akış ────────────────────────────────────────────────────────

  const save = useCallback(async (extra?: Record<string, unknown>) => {
    if (!doc) return false;
    setSaving(true);
    setSaveInfo("");
    try {
      const icerik = editorRef.current?.innerHTML ?? draftRef.current ?? doc.icerik;
      const res = await fetch(`/api/kys/dokumanlar/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icerik, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Doküman kaydedilemedi.");
      draftRef.current = null;
      setDirty(false);
      setSaveInfo(`Kaydedildi · ${formatDateTime(new Date().toISOString())}`);
      return true;
    } catch (e: unknown) {
      setSaveInfo("");
      setError(errorMessage(e, "Doküman kaydedilemedi."));
      return false;
    } finally {
      setSaving(false);
    }
     
  }, [doc]);

  async function saveKunye() {
    const ok = await save({
      kod: kunye.kod,
      baslik: kunye.baslik,
      tur: kunye.tur,
      ozet: kunye.ozet,
      yururlukTarihi: kunye.yururlukTarihi || null,
      hazirlayanId: kunye.hazirlayanId || null,
      hazirlayanAd: kunye.hazirlayanAd || null,
      onaylayanId: kunye.onaylayanId || null,
      onaylayanAd: kunye.onaylayanAd || null,
    });
    if (ok) { loadedKeyRef.current = ""; await fetchDoc(); }
  }

  function openAksiyon(aksiyon: Aksiyon) {
    setAksiyonModal(aksiyon);
    setAksiyonNot("");
    setAksiyonMaddeNo("");
    setAksiyonHata("");
    setAksiyonYururluk(doc?.yururlukTarihi || new Date().toISOString().slice(0, 10));
  }

  async function runAksiyon() {
    if (!doc || !aksiyonModal) return;
    const tanim = AKSIYONLAR[aksiyonModal];
    if (tanim.notZorunlu && !aksiyonNot.trim()) {
      setAksiyonHata("Bu işlem için açıklama girmelisiniz.");
      return;
    }
    if (aksiyonModal === "revizyon-baslat" && !aksiyonMaddeNo.trim()) {
      setAksiyonHata("Revizyon için madde no girmelisiniz.");
      return;
    }
    setAksiyonBusy(true);
    setAksiyonHata("");
    try {
      // Kilitlenmeden önce düzenlemeleri kaydet
      if (aksiyonModal === "onaya-gonder" && dirty) {
        const ok = await save();
        if (!ok) throw new Error("Değişiklikler kaydedilemedi, işlem durduruldu.");
      }
      const res = await fetch(`/api/kys/dokumanlar/${doc.id}/aksiyon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aksiyon: aksiyonModal,
          maddeNo: aksiyonMaddeNo.trim(),
          aciklama: aksiyonNot.trim(),
          ...(tanim.yururlukSor ? { yururlukTarihi: aksiyonYururluk } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "İşlem tamamlanamadı.");
      setAksiyonModal(null);
      loadedKeyRef.current = "";
      await fetchDoc();
      setActiveTab(aksiyonModal === "revizyon-baslat" || aksiyonModal === "reddet" ? (doc.hasDosya ? "kunye" : "icerik") : "akis");
    } catch (e: unknown) {
      setAksiyonHata(errorMessage(e, "İşlem tamamlanamadı."));
    } finally {
      setAksiyonBusy(false);
    }
  }

  async function openRevizyon(revId: number, etiket: string) {
    try {
      const res = await fetch(`/api/kys/dokumanlar/${documentId}/revizyonlar/${revId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Revizyon alınamadı.");
      setRevizyonOnizleme({ etiket, icerik: json.data.icerik || "", aciklama: json.data.aciklama || "" });
    } catch (e: unknown) {
      window.alert(errorMessage(e, "Revizyon alınamadı."));
    }
  }

  function printDocument() {
    if (doc?.hasDosya) {
      window.open(`/api/kys/dokumanlar/${doc.id}/dosya`, "_blank", "noopener,noreferrer");
      return;
    }
    window.open(`/kys-dokuman-yazdir/${doc?.id}?print=1`, "_blank", "noopener,noreferrer");
  }

  function openPreviewInNewTab() {
    const url = doc?.hasDosya
      ? `/api/kys/dokumanlar/${doc.id}/dosya`
      : `/laboratuvar/kys/dokuman-yonetimi/${doc?.id}/onizleme`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // ── Görünüm ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.detailWorkspace}>
        <section className={styles.detailPanel}>
          <div className={tableStyles.skeleton} />
          <div className={tableStyles.skeleton} />
          <div className={tableStyles.skeleton} />
        </section>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className={styles.detailWorkspace}>
        <section className={styles.detailPanel}>
          <Link href="/laboratuvar/kys/dokuman-yonetimi" className={styles.backLink}>
            <ArrowLeft size={15} />
            Listeye dön
          </Link>
          <div className={styles.emptyState}>
            <AlertTriangle size={26} />
            <p>{error || "Doküman bulunamadı."}</p>
          </div>
        </section>
      </div>
    );
  }

  const durum = doc.durum;
  const yayinTamam = durum === "Yayında";
  const kisiSecenekleri = kullanicilar.map(k => ({ id: String(k.ID), ad: k.Ad }));

  const akisAdimlari = [
    {
      label: "Hazırlayan",
      person: doc.hazirlayanAd || "-",
      note: durum === "Taslak" || durum === "Revize Ediliyor"
        ? "Doküman üzerinde çalışılıyor"
        : "Dokümanı onaya gönderdi",
      done: durum !== "Taslak" && durum !== "Revize Ediliyor",
      date: null as string | null,
    },
    {
      label: "Onaylayan",
      person: doc.onaylayanAd || "-",
      note: yayinTamam ? "Dokümanı yayına aldı" : "Yayın onayı bekleniyor",
      done: yayinTamam,
      date: doc.onayTarihi,
    },
  ];

  return (
    <div className={styles.detailWorkspace}>
      <section className={styles.detailPanel}>
        <div className={styles.documentHeader}>
          <div>
            <Link
              href="/laboratuvar/kys/dokuman-yonetimi"
              className={styles.backLink}
              onClick={event => {
                // Next.js istemci navigasyonu beforeunload'u tetiklemez — burada uyar
                if (dirty && !window.confirm("Kaydedilmemiş değişiklikleriniz var. Listeye dönmek istiyor musunuz?")) {
                  event.preventDefault();
                }
              }}
            >
              <ArrowLeft size={15} />
              Listeye dön
            </Link>
            <div className={styles.kicker}>{doc.kod} · {doc.tur}</div>
            <h2>{doc.baslik}</h2>
            <div className={styles.headerMeta}>
              <span className={`${styles.statusPill} ${statusTone[durum] || ""}`}>{durum}</span>
              <span>Rev. {doc.revizyonEtiket}</span>
              <span>Yürürlük: {formatDate(doc.yururlukTarihi)}</span>
              <span>Hazırlayan: {doc.hazirlayanAd || "-"}</span>
              <span>Onay: {doc.onaylayanAd || "-"}</span>
            </div>
          </div>
          <div className={styles.headerActions}>
            {canEdit && (
              <button type="button" className={styles.ghostButton} onClick={() => void save()} disabled={saving || !dirty}>
                <Save size={15} />
                {saving ? "Kaydediliyor..." : dirty ? "Kaydet" : "Kaydedildi"}
              </button>
            )}
            <button type="button" className={styles.ghostButton} onClick={() => doc.hasDosya ? openPreviewInNewTab() : setPreviewOpen(true)}>
              <Eye size={15} />
              Önizle
            </button>
            <button type="button" className={styles.ghostButton} onClick={printDocument}>
              <Printer size={15} />
              Yazdır / PDF
            </button>
            {canEdit && (
              <button type="button" className={styles.publishButton} onClick={() => openAksiyon("onaya-gonder")}>
                <Send size={16} />
                Onaya gönder
              </button>
            )}
            {durum === "Yayında" && yetki.duzenle && (
              <button type="button" className={styles.publishButton} onClick={() => openAksiyon("revizyon-baslat")}>
                <RotateCcw size={15} />
                Revizyon başlat
              </button>
            )}
            {durum === "Arşiv" && yetki.onayla && (
              <button type="button" className={styles.ghostButton} onClick={() => openAksiyon("arsivden-cikar")}>
                <ArchiveRestore size={15} />
                Arşivden çıkar
              </button>
            )}
          </div>
        </div>

        {error && <div className={tableStyles.errorBar}>{error}</div>}
        {dirty && <div className={styles.dirtyNotice}>Kaydedilmemiş değişiklikleriniz var. <kbd>Ctrl/⌘ + S</kbd> ile kaydedebilirsiniz.</div>}
        {!dirty && saveInfo && <div className={styles.savedNotice}>{saveInfo}</div>}

        <div className={styles.tabs} role="tablist" aria-label="Doküman sekmeleri">
          {([
            ...(!doc.hasDosya ? [["icerik", "İçerik"]] : []),
            ["kunye", "Künye"],
            ["akis", "Onay Akışı"],
            ["revizyon", `Revizyonlar (${doc.revizyonlar.length})`],
            ["gecmis", "İşlem Geçmişi"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={`${styles.tabButton} ${activeTab === key ? styles.tabButtonActive : ""}`}
              onClick={() => setActiveTab(key as typeof activeTab)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "icerik" && (
          <div className={styles.contentLayout}>
            <div className={styles.sectionNavSticky}>
              <aside className={styles.sectionNav} aria-label="Doküman içindekiler">
                <span className={styles.sideTitle}>Başlıklar</span>
                {sections.length === 0
                  ? <span className={styles.sideEmpty}>Henüz başlık yok</span>
                  : sections.map(section => (
                      <button key={section.id} type="button" onClick={() => scrollToSection(section.id)}>
                        {section.title}
                      </button>
                    ))}
              </aside>
            </div>
            <div className={styles.editorPanel}>
              <div className={styles.editorToolbar} aria-label="Metin araçları">
                <Link
                  href="/laboratuvar/kys/dokuman-yonetimi"
                  className={styles.toolbarBackLink}
                  title="Listeye dön"
                  onClick={event => {
                    if (dirty && !window.confirm("Kaydedilmemiş değişiklikleriniz var. Listeye dönmek istiyor musunuz?")) {
                      event.preventDefault();
                    }
                  }}
                >
                  <ArrowLeft size={14} />
                  Liste
                </Link>
                <span className={styles.toolbarDivider} />
                <ToolButton title="Ana başlık ekle (1.)" disabled={!canEdit} onRun={() => insertHeading(2)}>1.</ToolButton>
                <ToolButton title="Alt başlık ekle (1.1)" disabled={!canEdit} onRun={() => insertHeading(3)}>1.1</ToolButton>
                <ToolButton title="Alt alt başlık ekle (1.1.1)" disabled={!canEdit} onRun={() => insertHeading(4)}>1.1.1</ToolButton>
                <ToolButton title="Paragraf" disabled={!canEdit} onRun={() => runCommand("formatBlock", "p")}>P</ToolButton>
                <span className={styles.toolbarDivider} />
                <select
                  className={styles.fontSelect}
                  title="Yazı tipi"
                  disabled={!canEdit}
                  defaultValue=""
                  onMouseDown={rememberEditorSelection}
                  onChange={event => {
                    const value = event.target.value;
                    event.target.value = "";
                    applyFontFamily(value);
                  }}
                >
                  <option value="" disabled>Yazı tipi</option>
                  {FONT_OPTIONS.map(font => (
                    <option key={font.label} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>
                  ))}
                </select>
                <span className={styles.toolbarDivider} />
                <ToolButton title="Kalın" disabled={!canEdit} onRun={() => runCommand("bold")}><Bold size={15} /></ToolButton>
                <ToolButton title="İtalik" disabled={!canEdit} onRun={() => runCommand("italic")}><Italic size={15} /></ToolButton>
                <ToolButton title="Altı çizili" disabled={!canEdit} onRun={() => runCommand("underline")}><Underline size={15} /></ToolButton>
                <ToolButton title="Numaralı liste" disabled={!canEdit} onRun={() => runCommand("insertOrderedList")}><ListOrdered size={15} /></ToolButton>
                <ToolButton title="Madde listesi" disabled={!canEdit} onRun={() => runCommand("insertUnorderedList")}><List size={15} /></ToolButton>
                <ToolButton title="Revizyon işaretle (sarı vurgu)" disabled={!canEdit} onRun={() => runCommand("backColor", "#fff3bf")}><Highlighter size={15} /></ToolButton>
                <ToolButton title="Vurguyu kaldır" disabled={!canEdit} onRun={() => runCommand("backColor", "transparent")}><Undo2 size={15} /></ToolButton>
                <button
                  type="button"
                  className={styles.documentLinkButton}
                  disabled={!canEdit || yayinDokumanlari.length === 0}
                  onMouseDown={rememberEditorSelection}
                  onClick={() => { setLinkSearch(""); setLinkModalOpen(true); }}
                >
                  <Link2 size={14} />
                  Dokümana bağla
                </button>
                <span className={styles.toolbarDivider} />
                <ToolButton title="Tablo ekle" disabled={!canEdit} onRun={insertTable}><Table2 size={15} /></ToolButton>
                <div className={styles.tableMenuWrap} ref={tableMenuRef}>
                  <button
                    type="button"
                    title="Tablo düzenle (satır/sütun)"
                    disabled={!canEdit}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => setTableMenuOpen(open => !open)}
                  >
                    Tablo düzenle
                    <ChevronDown size={13} />
                  </button>
                  {tableMenuOpen && (
                    <div className={styles.tableMenu} role="menu">
                      <TableMenuItem label="Satır ekle (altına)" onRun={addTableRow} onDone={() => setTableMenuOpen(false)} />
                      <TableMenuItem label="Sütun ekle (sağına)" onRun={addTableColumn} onDone={() => setTableMenuOpen(false)} />
                      <div className={styles.tableMenuDivider} />
                      <TableMenuItem label="Satırı sil" onRun={removeTableRow} onDone={() => setTableMenuOpen(false)} />
                      <TableMenuItem label="Sütunu sil" onRun={removeTableColumn} onDone={() => setTableMenuOpen(false)} />
                      <div className={styles.tableMenuDivider} />
                      <TableMenuItem label="Sütun genişliği (%)" onRun={setTableColumnWidth} onDone={() => setTableMenuOpen(false)} />
                      <TableMenuItem label="Satır yüksekliği (px)" onRun={setTableRowHeight} onDone={() => setTableMenuOpen(false)} />
                    </div>
                  )}
                </div>
                <ToolButton title="Görsel ekle" disabled={!canEdit} onRun={() => imageInputRef.current?.click()}><ImagePlus size={15} /></ToolButton>
                <button
                  type="button"
                  className={styles.editToggle}
                  disabled={!canEdit}
                  onMouseDown={event => event.preventDefault()}
                  onClick={toggleEditing}
                >
                  {canEdit ? <PenLine size={15} /> : <Lock size={15} />}
                  {canEdit ? (editing ? "Düzenleme açık" : "Düzenle") : "Kilitli"}
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className={styles.hiddenFileInput}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) handleImageFile(file);
                    event.target.value = "";
                  }}
                />
              </div>

              {!canEdit && (
                <div className={styles.lockNotice}>
                  <Lock size={14} />
                  {!yetki.duzenle
                    ? "Doküman düzenleme yetkiniz yok. Sadece görüntüleyebilirsiniz."
                    : durum === "Yayında"
                      ? "Yayındaki doküman düzenlenemez. Değişiklik için revizyon başlatın."
                      : durum === "Arşiv"
                        ? "Arşivdeki doküman düzenlenemez. Önce arşivden çıkarın."
                        : "Doküman onay akışında olduğu için kilitli. Onay tamamlanana kadar düzenlenemez."}
                </div>
              )}

              <div
                ref={editorRef}
                className={`${styles.documentBody} ${editing ? styles.documentBodyEditing : ""} ${styles.printableBody}`}
                contentEditable={editing && canEdit}
                suppressContentEditableWarning
                onInput={() => { markDirty(); refreshSections(); }}
                onKeyUp={rememberEditorSelection}
                onMouseUp={rememberEditorSelection}
                onFocus={rememberEditorSelection}
                onPaste={handlePaste}
                onClick={handleDocumentLinkClick}
              />
            </div>
          </div>
        )}

        {activeTab === "kunye" && (
          <div className={styles.kunyePanel}>
            <div className={tableStyles.formGrid}>
              <div className={tableStyles.formGroup}>
                <label>Doküman kodu</label>
                <input value={kunye.kod} disabled={!canEdit} onChange={e => setKunye(k => ({ ...k, kod: e.target.value }))} />
              </div>
              <div className={tableStyles.formGroup}>
                <label>Doküman türü</label>
                <select value={kunye.tur} disabled={!canEdit} onChange={e => setKunye(k => ({ ...k, tur: e.target.value }))}>
                  {DOKUMAN_TURLERI.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className={`${tableStyles.formGroup} ${tableStyles.colSpan2}`}>
                <label>Doküman adı</label>
                <input value={kunye.baslik} disabled={!canEdit} onChange={e => setKunye(k => ({ ...k, baslik: e.target.value }))} />
              </div>
              <div className={tableStyles.formGroup}>
                <label>Yürürlük tarihi</label>
                <input type="date" value={kunye.yururlukTarihi} disabled={!canEdit} onChange={e => setKunye(k => ({ ...k, yururlukTarihi: e.target.value }))} />
              </div>
              <div className={tableStyles.formGroup}>
                <label>Revizyon</label>
                <input value={doc.revizyonEtiket} disabled readOnly />
              </div>
              {(["hazirlayan", "onaylayan"] as const).map(alan => {
                const etiket = alan === "hazirlayan" ? "Hazırlayan" : "Onaylayan";
                const idKey = `${alan}Id` as const;
                const adKey = `${alan}Ad` as const;
                const currentId = kunye[idKey];
                const currentAd = kunye[adKey];
                // Listede olmayan (silinmiş/pasif personel, eski serbest metin) bir isim
                // varsa bilgi amaçlı ayrı bir seçenek olarak göster — sessizce kaybolmasın.
                const showCustom = !kisiSecenekleri.some(k => k.id === currentId) && currentAd.trim().length > 0;
                return (
                  <div key={alan} className={tableStyles.formGroup}>
                    <label>{etiket}</label>
                    <select
                      value={showCustom ? "__custom__" : currentId}
                      disabled={!canEdit}
                      onChange={e => {
                        const id = e.target.value;
                        if (id === "__custom__") return;
                        const kisi = kisiSecenekleri.find(k => k.id === id);
                        setKunye(k => ({ ...k, [idKey]: id, [adKey]: kisi?.ad || "" }));
                      }}
                    >
                      <option value="">Seçilmedi</option>
                      {showCustom && <option value="__custom__">{currentAd} (listede yok)</option>}
                      {kisiSecenekleri.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
                    </select>
                  </div>
                );
              })}
              <div className={`${tableStyles.formGroup} ${tableStyles.colSpan2}`}>
                <label>Kısa açıklama</label>
                <textarea rows={3} value={kunye.ozet} disabled={!canEdit} onChange={e => setKunye(k => ({ ...k, ozet: e.target.value }))} />
              </div>
            </div>
            <div className={styles.kunyeFooter}>
              <span className={styles.flowHint}>
                Oluşturuldu: {formatDateTime(doc.createdAt)} · Son güncelleme: {formatDateTime(doc.updatedAt)}
              </span>
              {canEdit && (
                <button type="button" className={styles.publishButton} onClick={() => void saveKunye()} disabled={saving}>
                  <Save size={16} />
                  {saving ? "Kaydediliyor..." : "Künyeyi kaydet"}
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === "akis" && (
          <div className={styles.flowGrid}>
            {akisAdimlari.map(step => (
              <div key={step.label} className={styles.flowCard}>
                {step.done ? <CheckCircle2 size={18} className={styles.flowDone} /> : <Circle size={18} className={styles.flowPending} />}
                <span className={styles.flowLabel}>{step.label}</span>
                <strong>{step.person}</strong>
                <small>{step.note}</small>
                {step.date && <small className={styles.flowDate}>{formatDateTime(step.date)}</small>}
              </div>
            ))}

            <div className={styles.workflowActions}>
              <button
                type="button"
                className={styles.publishButton}
                onClick={() => openAksiyon("onaya-gonder")}
                disabled={!canEdit}
              >
                <Send size={16} />
                Onaya gönder
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => openAksiyon("yayin-onayi")}
                disabled={(durum !== "Onay Bekliyor" && durum !== "Kontrol Bekliyor") || !yetki.onayla}
                title={!yetki.onayla ? "Yayın onayı yetkiniz yok" : undefined}
              >
                <CheckCircle2 size={16} />
                Yayına al
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => openAksiyon("reddet")}
                disabled={(durum !== "Kontrol Bekliyor" && durum !== "Onay Bekliyor") || !yetki.onayla}
              >
                <XCircle size={16} />
                Revizyona geri gönder
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => openAksiyon("revizyon-baslat")}
                disabled={durum !== "Yayında" || !yetki.duzenle}
              >
                <RotateCcw size={16} />
                Revizyon başlat
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => openAksiyon("arsivle")}
                disabled={(durum !== "Yayında" && durum !== "Taslak") || !yetki.onayla}
              >
                <Archive size={16} />
                Arşive al
              </button>
            </div>

            <p className={styles.flowHint}>
              Doküman onaya gönderildiğinde kilitlenir. Onaylayan kişi dokümanı yayına alır ve o sürüm revizyon
              geçmişine kaydedilir. Yayındaki bir dokümanda
              değişiklik yapmak için revizyon başlatılır; revizyon numarası otomatik artar.
            </p>
          </div>
        )}

        {activeTab === "revizyon" && (
          <div className={styles.revisionList}>
            {doc.revizyonlar.length === 0 ? (
              <div className={styles.emptyState}>
                <History size={24} />
                <p>Bu doküman henüz yayınlanmadı. İlk yayın onayından sonra revizyon geçmişi burada listelenecek.</p>
              </div>
            ) : doc.revizyonlar.map(rev => (
              <div key={rev.id} className={styles.revisionItem}>
                <div>
                  <strong>Rev. {rev.revizyonEtiket}</strong>
                  <span>{rev.aciklama || "Açıklama girilmedi."}</span>
                  <small>
                    Madde: {rev.maddeNo || "-"} · Yayın: {formatDate(rev.yayinTarihi)} ·
                    Hazırlayan: {rev.hazirlayanAd || "-"} · Onay: {rev.onaylayanAd || "-"}
                  </small>
                </div>
                <button type="button" className={styles.ghostButton} onClick={() => void openRevizyon(rev.id, rev.revizyonEtiket)}>
                  <Eye size={15} />
                  Sürümü gör
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === "gecmis" && (
          <div className={styles.logList}>
            {doc.loglar.length === 0 ? (
              <div className={styles.emptyState}><History size={24} /><p>Kayıt yok.</p></div>
            ) : (
              <table className={tableStyles.table}>
                <thead>
                  <tr><th>Tarih</th><th>İşlem</th><th>Durum</th><th>Rev.</th><th>Kullanıcı</th><th>Açıklama</th></tr>
                </thead>
                <tbody>
                  {doc.loglar.map(log => (
                    <tr key={log.id}>
                      <td className={tableStyles.tdMono}>{formatDateTime(log.createdAt)}</td>
                      <td className={tableStyles.tdName}>{log.islem}</td>
                      <td className={tableStyles.tdSecondary}>
                        {log.oncekiDurum && log.yeniDurum && log.oncekiDurum !== log.yeniDurum
                          ? `${log.oncekiDurum} → ${log.yeniDurum}`
                          : log.yeniDurum || "-"}
                      </td>
                      <td className={tableStyles.tdMono}>{log.revizyon == null ? "-" : String(log.revizyon).padStart(2, "0")}</td>
                      <td>{log.kullaniciAd || "-"}</td>
                      <td className={tableStyles.tdSecondary}>{log.aciklama || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {previewOpen && (
        <div className={styles.previewBackdrop} role="dialog" aria-modal="true" aria-label="Doküman önizleme" onClick={() => setPreviewOpen(false)}>
          <div className={styles.previewModal} onClick={event => event.stopPropagation()}>
            <div className={styles.previewHeader}>
              <div>
                <div className={styles.kicker}>{doc.kod} · Rev. {doc.revizyonEtiket}</div>
                <h3>{doc.baslik}</h3>
              </div>
              <div className={styles.headerActions}>
                <button type="button" className={styles.ghostButton} onClick={openPreviewInNewTab}>
                  <ExternalLink size={15} />
                  Yeni sekmede aç
                </button>
                <button type="button" className={styles.ghostButton} onClick={printDocument}>
                  <Printer size={15} />
                  Yazdır / PDF
                </button>
                <button type="button" className={styles.iconButton} aria-label="Önizlemeyi kapat" onClick={() => setPreviewOpen(false)}>
                  <X size={17} />
                </button>
              </div>
            </div>
            <div className={styles.previewPaper}>
              <div className={styles.previewPaperInner}>
                <div className={styles.previewDocumentHeader}>
                  <img src="/unique-logo-wide.png" alt="UNIQUE Analyse" />
                  <strong>{doc.baslik}</strong>
                  <table><tbody>
                    <tr><th>Doküman No</th><td>{doc.kod}</td></tr>
                    <tr><th>Revizyon</th><td>{doc.revizyonEtiket}</td></tr>
                    <tr><th>Yürürlük Tarihi</th><td>{formatDate(doc.yururlukTarihi)}</td></tr>
                  </tbody></table>
                </div>
                <div
                  className={styles.documentBody}
                  onClick={handleDocumentLinkClick}
                  dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML ?? draftRef.current ?? doc.icerik }}
                />
                <div className={styles.previewDocumentFooter}>
                  <span>Sayfa 1</span>
                  <strong>ELEKTRONİK NÜSHA. BASILMIŞ HALİ KONTROLSÜZ KOPYADIR.</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {linkModalOpen && (
        <div className={tableStyles.modalOverlay} role="dialog" aria-modal="true" aria-label="Yayındaki dokümana bağlantı ver" onMouseDown={rememberEditorSelection}>
          <div className={`${tableStyles.modal} ${styles.documentLinkModal}`} onClick={event => event.stopPropagation()}>
            <div className={tableStyles.modalHeader}>
              <div><h2>Yayındaki dokümana bağla</h2><p className={styles.modalHint}>Seçili metin, seçeceğiniz dokümana yeni sekmede açılan bir bağlantı olur.</p></div>
              <button type="button" className={tableStyles.modalClose} onClick={() => setLinkModalOpen(false)} aria-label="Kapat">×</button>
            </div>
            <div className={tableStyles.modalBody}>
              <label className={styles.documentLinkSearch}>
                <span>Doküman no veya adı</span>
                <input autoFocus value={linkSearch} onChange={event => setLinkSearch(event.target.value)} placeholder="Örn. PR-01 veya Numune Kabul" />
              </label>
              <div className={styles.documentLinkResults}>
                {yayinDokumanlari
                  .filter(item => item.id !== doc.id)
                  .sort((a, b) => a.kod.localeCompare(b.kod, "tr", { numeric: true }))
                  .filter(item => `${item.kod} ${item.baslik}`.toLocaleLowerCase("tr-TR").includes(linkSearch.trim().toLocaleLowerCase("tr-TR")))
                  .map(item => (
                    <button key={item.id} type="button" onClick={() => createPublishedDocumentLink(String(item.id))}>
                      <strong>{item.kod}</strong><span>{item.baslik}</span><small>{item.tur}</small>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {revizyonOnizleme && (
        <div className={styles.previewBackdrop} role="dialog" aria-modal="true" aria-label="Revizyon önizleme" onClick={() => setRevizyonOnizleme(null)}>
          <div className={styles.previewModal} onClick={event => event.stopPropagation()}>
            <div className={styles.previewHeader}>
              <div>
                <div className={styles.kicker}>{doc.kod} · Rev. {revizyonOnizleme.etiket} (arşiv sürümü)</div>
                <h3>{doc.baslik}</h3>
              </div>
              <button type="button" className={styles.iconButton} aria-label="Kapat" onClick={() => setRevizyonOnizleme(null)}>
                <X size={17} />
              </button>
            </div>
            <div className={styles.previewPaper}>
              <div className={styles.previewPaperInner}>
                <div className={styles.previewMeta}><span>{revizyonOnizleme.aciklama || "Açıklama girilmedi."}</span></div>
                <div className={styles.documentBody} dangerouslySetInnerHTML={{ __html: revizyonOnizleme.icerik }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {aksiyonModal && (
        <div className={tableStyles.modalOverlay} role="dialog" aria-modal="true" aria-label={AKSIYONLAR[aksiyonModal].baslik}>
          <div className={`${tableStyles.modal} ${tableStyles.modalSm}`}>
            <div className={tableStyles.modalHeader}>
              <h2>{AKSIYONLAR[aksiyonModal].baslik}</h2>
              <button type="button" className={tableStyles.modalClose} onClick={() => setAksiyonModal(null)} aria-label="Kapat">×</button>
            </div>
            <div className={tableStyles.modalBody}>
              {aksiyonHata && <div className={tableStyles.formError}>{aksiyonHata}</div>}
              <p className={styles.modalHint}>{AKSIYONLAR[aksiyonModal].aciklama}</p>
              {AKSIYONLAR[aksiyonModal].yururlukSor && (
                <div className={tableStyles.formGroup}>
                  <label>Yürürlük tarihi</label>
                  <input type="date" value={aksiyonYururluk} onChange={e => setAksiyonYururluk(e.target.value)} />
                </div>
              )}
              {aksiyonModal === "revizyon-baslat" && (
                <div className={tableStyles.formGroup}>
                  <label>Madde no <span className={tableStyles.required}> *</span></label>
                  <input value={aksiyonMaddeNo} autoFocus onChange={e => setAksiyonMaddeNo(e.target.value)} placeholder="Örn. 4.2, 5.1-5.3" />
                </div>
              )}
              <div className={tableStyles.formGroup}>
                <label>
                  {AKSIYONLAR[aksiyonModal].notEtiketi}
                  {AKSIYONLAR[aksiyonModal].notZorunlu && <span className={tableStyles.required}> *</span>}
                </label>
                <textarea rows={3} value={aksiyonNot} autoFocus={aksiyonModal !== "revizyon-baslat"} onChange={e => setAksiyonNot(e.target.value)} />
              </div>
            </div>
            <div className={tableStyles.modalFooter}>
              <button type="button" className={tableStyles.cancelBtn} disabled={aksiyonBusy} onClick={() => setAksiyonModal(null)}>Vazgeç</button>
              <button type="button" className={tableStyles.saveBtn} disabled={aksiyonBusy} onClick={() => void runAksiyon()}>
                {aksiyonBusy ? "İşleniyor..." : AKSIYONLAR[aksiyonModal].onayEtiketi}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yazdırma üst/alt bilgileri — her sayfada sabitlenir */}
      <div className={styles.printHeader} aria-hidden="true">
        <img src="/unique-logo-wide.png" alt="UNIQUE Analyse" />
        <strong>{doc.baslik}</strong>
        <table><tbody>
          <tr><th>Doküman No</th><td>{doc.kod}</td></tr>
          <tr><th>Revizyon</th><td>{doc.revizyonEtiket}</td></tr>
          <tr><th>Yürürlük Tarihi</th><td>{formatDate(doc.yururlukTarihi)}</td></tr>
        </tbody></table>
      </div>
      <div className={styles.printFooter} aria-hidden="true">
        <span className={styles.printPageNumber}>Sayfa </span>
        <strong>ELEKTRONİK NÜSHA. BASILMIŞ HALİ KONTROLSÜZ KOPYADIR.</strong>
      </div>
      <div className={styles.printAppendix} aria-hidden="true">
        <h2>Revizyon Geçmişi</h2>
        <table><thead><tr><th>Rev.</th><th>Madde No</th><th>Açıklama</th><th>Yayın Tarihi</th></tr></thead>
          <tbody>{doc.revizyonlar.map(rev => <tr key={rev.id}><td>{rev.revizyonEtiket}</td><td>{rev.maddeNo || "-"}</td><td>{rev.aciklama || "-"}</td><td>{formatDate(rev.yayinTarihi)}</td></tr>)}</tbody>
        </table>
        <div className={styles.signatureGrid}>
          <div><span>Hazırlayan</span><strong>{doc.hazirlayanAd || "-"}</strong><i>Islak İmza</i></div>
          <div><span>Onaylayan</span><strong>{doc.onaylayanAd || "-"}</strong><i>Islak İmza</i></div>
        </div>
      </div>
    </div>
  );
}
