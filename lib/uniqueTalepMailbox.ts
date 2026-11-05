import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getAllSettings } from "./settings";
import { classifyUniqueMail } from "./uniqueTalepRules";
import { insertUniqueRequest, uniquePool } from "./uniqueTalepStore";
import { hasMysqlConfig } from "./mysqlCompat";

// Read-only INBOX access: never alter Seen flags, move or delete customer mail.
export async function syncUniqueMailbox() {
  const pool = await uniquePool();
  const lease = await pool.request().query(hasMysqlConfig()
    ? "UPDATE UniqueTalepSync SET LeaseUntil=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE) WHERE ID=1 AND (LeaseUntil IS NULL OR LeaseUntil<UTC_TIMESTAMP())"
    : "UPDATE UniqueTalepSync SET LeaseUntil=DATEADD(minute,10,GETUTCDATE()) WHERE ID=1 AND (LeaseUntil IS NULL OR LeaseUntil<GETUTCDATE())");
  if (!lease.rowsAffected.some(n => n > 0)) return { added: 0, examined: 0, more: true, skipped: true };
  try { return await scanUniqueMailbox(); }
  finally { await pool.request().query("UPDATE UniqueTalepSync SET LeaseUntil=NULL WHERE ID=1"); }
}
async function scanUniqueMailbox() {
  const cfg = await getAllSettings();
  const setting = (key: string, fallback = "") => cfg[key] || process.env[key] || fallback;
  const user = setting("UNIQUE_IMAP_USER", setting("MAIL_USER"));
  if (user.toLowerCase() !== "info@uniqueanalyse.com") throw new Error("Unique Talep için UNIQUE_IMAP_USER info@uniqueanalyse.com olmalıdır.");
  const pass = setting("UNIQUE_IMAP_PASS", setting("MAIL_PASS"));
  const host = setting("UNIQUE_IMAP_HOST", setting("MAIL_HOST"));
  if (!host || !pass) throw new Error("Info posta kutusunun IMAP erişim bilgileri eksik.");
  const client = new ImapFlow({ host, port: Number(setting("UNIQUE_IMAP_PORT", "993")), secure: true,
    auth: { user, pass }, logger: false, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  client.on("error", () => { /* Do not log mailbox content or credentials. */ });
  let added = 0, examined = 0, more = false;
  const started = Date.now();
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const validity = client.mailbox ? String(client.mailbox.uidValidity) : "";
      const since = new Date(Date.now() - 30 * 86400000);
      const ids = await client.search({ since }, { uid: true });
      if (!ids || !ids.length) return { added, examined, more };
      const known = await (await uniquePool()).request().query("SELECT SourceKey FROM UniqueTalep");
      const keys = new Set(known.recordset.map((row: { SourceKey: string }) => row.SourceKey));
      const sourceKey = (uid: number) => createHash("sha256").update(`${user}:INBOX:${validity}:${uid}`).digest("hex");
      const pending = ids.filter(uid => !keys.has(sourceKey(uid))).sort((a, b) => b - a);
      more = pending.length > 40;
      // Download bounded messages; keep metadata for oversized mail rather than losing a lead.
      for (const uid of pending.slice(0, 40)) {
        if (Date.now() - started > 180000) { more = true; break; }
        const meta = await client.fetchOne(String(uid), { envelope: true, size: true }, { uid: true });
        if (!meta) continue;
        const sender = meta.envelope?.from?.[0];
        const email = sender?.address || "";
        if (!email) continue;
        let text = "E-posta boyutu 5 MB üzerindedir. Kapsamı posta kutusundan kontrol edin.";
        if ((meta.size || 0) <= 5 * 1024 * 1024) {
          const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!message || !message.source) continue;
          const parsed = await simpleParser(message.source, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true });
          text = (parsed.text || "Bu e-postanın metin içeriği yok; ekleri posta kutusundan inceleyin.").slice(0, 60000);
        }
        const subject = String(meta.envelope?.subject || "(Konusuz)").slice(0, 500);
        const classification = classifyUniqueMail(subject, text, email);
        const inserted = await insertUniqueRequest({ source: sourceKey(uid), date: new Date(meta.envelope?.date || Date.now()).toISOString(),
          name: (sender?.name || email).slice(0, 255), email, messageId: meta.envelope?.messageId || "", subject, text,
          ...classification, status: "Bekliyor", companyId: null, companyName: "", offer: null, quoteId: null,
          mailState: "Taslak", sentAt: null, sentMessageId: "", error: "" });
        examined++; if (inserted) added++;
      }
    } finally { lock.release(); }
    return { added, examined, more };
  } finally { await client.logout().catch(() => client.close()); }
}
