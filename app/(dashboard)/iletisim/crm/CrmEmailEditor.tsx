"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Mark, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { AlignCenter, AlignLeft, AlignRight, Bold, Code, CodeXml, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, Redo, RemoveFormatting, Table2, Underline, Undo, Unlink } from "lucide-react";
import { CRM_EMAIL_LIMIT, sanitizeCrmEmailHtml, textToEmailHtml } from "@/lib/crmEmail";
import styles from "../spektrotek-talep/requests.module.css";
import ui from "./crm.module.css";

const EmailImage = Node.create({
  name: "emailImage", group: "block", atom: true, draggable: true,
  addAttributes() { return { src: { default: "" }, alt: { default: "" }, width: { default: "560" } }; },
  parseHTML() { return [{ tag: "img[src]" }]; },
  renderHTML({ HTMLAttributes }) { return ["img", mergeAttributes({ style: "max-width:100%;height:auto;display:block" }, HTMLAttributes)]; },
});
const EmailTextStyle = Mark.create({
  name: "emailTextStyle",
  addAttributes() { return {
    color: { default: null, parseHTML: element => element.style.color },
    backgroundColor: { default: null, parseHTML: element => element.style.backgroundColor },
    fontSize: { default: null, parseHTML: element => element.style.fontSize },
    fontFamily: { default: null, parseHTML: element => element.style.fontFamily },
  }; },
  parseHTML() { return [{ tag: "span[style]" }]; },
  renderHTML({ HTMLAttributes }) {
    const values = Object.entries(HTMLAttributes).filter(([, value]) => value).map(([key, value]) => `${key.replace(/[A-Z]/g, s => `-${s.toLowerCase()}`)}:${value}`).join(";");
    return ["span", { style: values }, 0];
  },
});
type Props = { value: string; format?: "text" | "html"; disabled: boolean; onChange: (value: string, format: "html") => void };
export default function CrmEmailEditor({ value, format, disabled, onChange }: Props) {
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [insert, setInsert] = useState<"image" | "link" | null>(null), [url, setUrl] = useState(""), [alt, setAlt] = useState(""), [width, setWidth] = useState("560"), [message, setMessage] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const html = format === "html" ? sanitizeCrmEmailHtml(value) : textToEmailHtml(value);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, protocols: ["https", "http", "mailto", "tel"] } }), TextAlign.configure({ types: ["heading", "paragraph"] }), EmailImage, EmailTextStyle, Table.configure({ resizable: false }), TableRow, TableCell, TableHeader],
    content: html, immediatelyRender: false, shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: ui.editable, role: "textbox", "aria-label": "Mail içeriği", "aria-multiline": "true" }, transformPastedHTML: html => sanitizeCrmEmailHtml(html) },
    onUpdate: ({ editor }) => onChange(sanitizeCrmEmailHtml(editor.getHTML()), "html"),
  });
  useEffect(() => { if (editor && mode === "visual" && html !== sanitizeCrmEmailHtml(editor.getHTML())) editor.commands.setContent(html, { emitUpdate: false }); }, [editor, html, mode]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  function changeMode(next: "visual" | "html") {
    if (next === mode) return;
    setMessage("");
    if (next === "html" && format !== "html") onChange(html, "html");
    if (next === "visual") editor?.commands.setContent(html, { emitUpdate: false });
    setMode(next);
  }
  function addImage(src: string) {
    if (!editor) return;
    if (!/^https:\/\/\S+$/i.test(src) && !/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(src)) { setMessage("HTTPS görsel adresi veya PNG/JPEG/GIF/WebP dosyası kullanın."); return; }
    if (src.length + html.length > CRM_EMAIL_LIMIT - 1000) { setMessage("Şablon çok büyük. Daha küçük bir görsel veya HTTPS adresi kullanın."); return; }
    const attributes = { src, alt, width: String(Math.min(1200, Math.max(40, Number(width) || 560))) };
    if (editor.isActive("emailImage")) editor.chain().focus().updateAttributes("emailImage", attributes).run();
    else editor.chain().focus().insertContent({ type: "emailImage", attrs: attributes }).run();
    setInsert(null); setUrl(""); setMessage("");
  }
  async function upload(file: File) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type) || file.size > 200000) { setMessage("En fazla 200 KB PNG/JPEG/GIF/WebP dosyası seçin."); return; }
    const reader = new FileReader();
    reader.onload = () => addImage(String(reader.result));
    reader.onerror = () => setMessage("Görsel okunamadı.");
    reader.readAsDataURL(file);
  }
  function addLink() {
    if (!editor || !/^(https?:\/\/|mailto:|tel:)\S+$/i.test(url)) { setMessage("Geçerli bir https://, mailto: veya tel: adresi girin."); return; }
    const link = { type: "text", text: url, marks: [{ type: "link", attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } }] };
    if (editor.isActive("emailImage")) editor.chain().focus().insertContentAt(editor.state.selection.to, { type: "paragraph", content: [link] }).run();
    else if (editor.state.selection.empty && !editor.isActive("link")) editor.chain().focus().insertContent(link).run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setInsert(null); setUrl(""); setMessage("");
  }
  const tools = editor ? [
    { name: "Kalın", icon: Bold, active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { name: "İtalik", icon: Italic, active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    { name: "Altı çizili", icon: Underline, active: editor.isActive("underline"), run: () => editor.chain().focus().toggleUnderline().run() },
    { name: "Sola hizala", icon: AlignLeft, run: () => editor.chain().focus().setTextAlign("left").run() },
    { name: "Ortala", icon: AlignCenter, run: () => editor.chain().focus().setTextAlign("center").run() },
    { name: "Sağa hizala", icon: AlignRight, run: () => editor.chain().focus().setTextAlign("right").run() },
    { name: "Madde işaretleri", icon: List, active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { name: "Numaralı liste", icon: ListOrdered, active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { name: "Alıntı", icon: Quote, active: editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
    { name: "Kod bloğu", icon: Code, active: editor.isActive("codeBlock"), run: () => editor.chain().focus().toggleCodeBlock().run() },
    { name: "Ayırıcı çizgi", icon: Minus, run: () => editor.chain().focus().setHorizontalRule().run() },
    { name: "Bağlantı ekle / düzenle", icon: Link2, active: editor.isActive("link"), run: () => { setInsert("link"); setUrl(editor.getAttributes("link").href || "https://"); setMessage(""); } },
    { name: "Bağlantıyı kaldır", icon: Unlink, run: () => editor.chain().focus().unsetLink().run() },
    { name: "Resim ekle / düzenle", icon: ImagePlus, run: () => { const image = editor.getAttributes("emailImage"); setInsert("image"); setUrl(image.src || ""); setAlt(image.alt || ""); setWidth(image.width || "560"); setMessage(""); } },
    { name: "Tablo ekle", icon: Table2, run: () => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run() },
    { name: "Biçimlendirmeyi temizle", icon: RemoveFormatting, run: () => editor.chain().focus().unsetAllMarks().clearNodes().run() },
    { name: "Geri al", icon: Undo, run: () => editor.chain().focus().undo().run() },
    { name: "Yinele", icon: Redo, run: () => editor.chain().focus().redo().run() },
  ] : [];
  return <div className={ui.emailEditor}>
    <div className={ui.editorMode}><span>İçerik</span><div className={styles.actions}><button type="button" className={styles.button} disabled={disabled} aria-pressed={mode === "visual"} onClick={() => changeMode("visual")}>Görsel düzenle</button><button type="button" className={styles.button} disabled={disabled} aria-pressed={mode === "html"} onClick={() => changeMode("html")}><CodeXml size={14} />HTML kaynak</button></div></div>
    {mode === "visual" ? <>
      <div className={ui.editorToolbar} role="group" aria-label="Mail biçimlendirme">
        <select aria-label="Paragraf biçimi" disabled={disabled || !editor} value={editor?.isActive("heading", { level: 1 }) ? "1" : editor?.isActive("heading", { level: 2 }) ? "2" : editor?.isActive("heading", { level: 3 }) ? "3" : "p"} onChange={e => { if (e.target.value === "p") editor?.chain().focus().setParagraph().run(); else editor?.chain().focus().setHeading({ level: Number(e.target.value) as 1 | 2 | 3 }).run(); }}><option value="p">Paragraf</option><option value="1">Başlık 1</option><option value="2">Başlık 2</option><option value="3">Başlık 3</option></select>
        <select aria-label="Yazı tipi" defaultValue="Arial, sans-serif" disabled={disabled || !editor} onChange={e => editor?.chain().focus().setMark("emailTextStyle", { fontFamily: e.target.value }).run()}>{["Arial, sans-serif", "Verdana, sans-serif", "Tahoma, sans-serif", "Georgia, serif"].map(font => <option key={font}>{font}</option>)}</select>
        <select aria-label="Yazı boyutu" defaultValue="14px" disabled={disabled || !editor} onChange={e => editor?.chain().focus().setMark("emailTextStyle", { fontSize: e.target.value }).run()}>{["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"].map(size => <option key={size}>{size}</option>)}</select>
        {tools.map(tool => <button type="button" key={tool.name} className={styles.icon} title={tool.name} aria-label={tool.name} aria-pressed={tool.active} disabled={disabled} onClick={tool.run}><tool.icon size={15} /></button>)}
        <label className={ui.colorField} title="Yazı rengi">A<input type="color" aria-label="Yazı rengi" disabled={disabled || !editor} defaultValue="#20242a" onChange={e => editor?.chain().focus().setMark("emailTextStyle", { color: e.target.value }).run()} /></label>
        <label className={ui.colorField} title="Vurgu rengi">V<input type="color" aria-label="Vurgu rengi" disabled={disabled || !editor} defaultValue="#fff2b2" onChange={e => editor?.chain().focus().setMark("emailTextStyle", { backgroundColor: e.target.value }).run()} /></label>
        <button type="button" className={styles.button} disabled={disabled || !editor} onClick={() => editor?.chain().focus().insertContent("{{firma}}").run()}>Firma alanı</button><button type="button" className={styles.button} disabled={disabled || !editor} onClick={() => editor?.chain().focus().insertContent("{{yetkili}}").run()}>Yetkili alanı</button>
      </div>
      {editor?.isActive("table") && <div className={ui.editorToolbar}>{[{ text: "Satır ekle", run: () => editor.chain().focus().addRowAfter().run() }, { text: "Sütun ekle", run: () => editor.chain().focus().addColumnAfter().run() }, { text: "Satırı sil", run: () => editor.chain().focus().deleteRow().run() }, { text: "Sütunu sil", run: () => editor.chain().focus().deleteColumn().run() }, { text: "Tabloyu sil", run: () => editor.chain().focus().deleteTable().run() }].map(action => <button type="button" key={action.text} className={styles.button} disabled={disabled} onClick={action.run}>{action.text}</button>)}</div>}
      {insert && <div className={ui.insertPanel}><div className={styles.fields}><label>{insert === "image" ? "Görsel adresi (HTTPS)" : "Bağlantı adresi"}<input value={url} onChange={e => setUrl(e.target.value)} disabled={disabled} /></label>{insert === "image" && <><label>Görsel açıklaması<input maxLength={300} value={alt} onChange={e => setAlt(e.target.value)} disabled={disabled} /></label><label>Genişlik (piksel)<input type="number" min={40} max={1200} value={width} onChange={e => setWidth(e.target.value)} disabled={disabled} /></label></>}</div><div className={styles.actions}><button type="button" className={styles.button} disabled={disabled} onClick={() => insert === "image" ? addImage(url) : addLink()}>İçeriğe ekle</button>{insert === "image" && <button type="button" className={styles.button} disabled={disabled} onClick={() => imageInput.current?.click()}>Dosyadan resim seç</button>}<button type="button" className={styles.button} onClick={() => setInsert(null)}>Vazgeç</button></div><input hidden ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} /></div>}
      <EditorContent editor={editor} />
    </> : <div className={ui.sourcePanel}><label htmlFor="crm-email-source">HTML kaynak kodu</label><textarea id="crm-email-source" spellCheck={false} rows={16} maxLength={CRM_EMAIL_LIMIT} value={format === "html" ? value : html} disabled={disabled} onChange={e => onChange(e.target.value, "html")} /><p className={styles.muted}>HTML ve satır içi CSS ekleyebilirsiniz. Script ve çalıştırılabilir içerik temizlenir. Görsel düzenlemeye geçişte editörün desteklediği biçimler korunur.</p></div>}
    {message && <p role="alert" className={styles.error}>{message}</p>}
    <p className={`${styles.muted} ${ui.editorHint}`}>Görseller: HTTPS adresi veya en fazla 200 KB dosya. Mail uyumluluğu için HTTPS adresi önerilir. {Math.ceil(value.length / 1000)} / 750 KB içerik.</p>
  </div>;
}
