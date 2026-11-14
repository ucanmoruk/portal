import { randomUUID } from "node:crypto";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { WORKSPACES, type WorkspaceRecord, type WorkspaceAudit } from "./kysWorkspaceConfig";

let ready: Promise<void> | undefined;
export async function ensureWorkspaceSchema() {
  if (!ready) ready = (async () => {
    const pool = await cosmoPool;
    await pool.request().query(hasMysqlConfig() ? `CREATE TABLE IF NOT EXISTS KysWorkspaceRecord (
      ID VARCHAR(36) PRIMARY KEY, Module VARCHAR(60) NOT NULL, Code VARCHAR(120) NULL,
      Version INT NOT NULL, Payload LONGTEXT NOT NULL, UNIQUE KEY UQ_KysWorkspaceCode (Module,Code)
    )` : `IF OBJECT_ID('KysWorkspaceRecord','U') IS NULL CREATE TABLE KysWorkspaceRecord (
      ID VARCHAR(36) PRIMARY KEY, Module VARCHAR(60) NOT NULL, Code VARCHAR(120) NULL, Version INT NOT NULL, Payload NVARCHAR(MAX) NOT NULL);
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UQ_KysWorkspaceCode' AND object_id=OBJECT_ID('KysWorkspaceRecord')) CREATE UNIQUE INDEX UQ_KysWorkspaceCode ON KysWorkspaceRecord(Module,Code) WHERE Code IS NOT NULL`);
    await pool.request().query(hasMysqlConfig() ? `CREATE TABLE IF NOT EXISTS KysWorkspaceAudit (
      ID VARCHAR(36) PRIMARY KEY, RecordID VARCHAR(36) NOT NULL, Payload LONGTEXT NOT NULL, INDEX IX_KysWorkspaceAudit (RecordID)
    )` : `IF OBJECT_ID('KysWorkspaceAudit','U') IS NULL CREATE TABLE KysWorkspaceAudit (
      ID VARCHAR(36) PRIMARY KEY, RecordID VARCHAR(36) NOT NULL, Payload NVARCHAR(MAX) NOT NULL)`);
    const tx = await pool.transaction(); await tx.begin();
    try {
      const rows = (await tx.request().query(hasMysqlConfig() ? "SELECT Payload FROM KysWorkspaceRecord FOR UPDATE" : "SELECT Payload FROM KysWorkspaceRecord WITH (UPDLOCK,HOLDLOCK)")).recordset.map((r: { Payload: string }) => JSON.parse(r.Payload) as WorkspaceRecord);
      for (const before of rows) {
        const oldSchedule = ["kalibrasyon-plani", "ara-kontrol-plani"].includes(before.module);
        const oldMeeting = before.module === "toplanti-kararlari" && before.data.meetingId && !before.data.meetingTitle;
        if (!oldSchedule && !oldMeeting) continue;
        const meeting = rows.find((r: WorkspaceRecord) => r.id === before.data.meetingId && r.module === "toplantilar");
        const now = new Date().toISOString();
        const after = { ...before, module: oldSchedule ? "kalibrasyon-kontrol" : before.module, version: before.version + 1, updatedAt: now, updatedBy: "Sistem · süreç birleştirme", data: oldSchedule ? { ...before.data, kind: before.module === "kalibrasyon-plani" ? "Kalibrasyon" : "Ara Kontrol" } : { ...before.data, meetingTitle: meeting?.data.title || "Önceki toplantı", meetingDate: meeting?.data.date || before.createdAt.slice(0,10), participants: meeting?.data.participants || "" } };
        await tx.request().input("ID", before.id).input("Module", after.module).input("Version", after.version).input("Payload", JSON.stringify(after)).query("UPDATE KysWorkspaceRecord SET Module=@Module,Version=@Version,Payload=@Payload WHERE ID=@ID");
        const audit = { id: randomUUID(), recordId: before.id, actor: after.updatedBy, at: now, action: "Süreçler birleştirildi", before, after };
        await tx.request().input("ID",audit.id).input("RecordID",before.id).input("Payload",JSON.stringify(audit)).query("INSERT INTO KysWorkspaceAudit (ID,RecordID,Payload) VALUES (@ID,@RecordID,@Payload)");
      }
      await tx.commit();
    } catch (error) { await tx.rollback(); throw error; }
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}
export async function listWorkspaceRecords(module?: string): Promise<WorkspaceRecord[]> {
  await ensureWorkspaceSchema();
  const pool = await cosmoPool;
  const request = pool.request();
  if (module) request.input("Module", module);
  const result = await request.query(`SELECT Payload FROM KysWorkspaceRecord${module ? " WHERE Module=@Module" : ""}`);
  return result.recordset.map((row: { Payload: string }) => JSON.parse(row.Payload) as WorkspaceRecord).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function workspaceHistory(id: string): Promise<WorkspaceAudit[]> {
  await ensureWorkspaceSchema();
  const pool = await cosmoPool;
  const result = await pool.request().input("ID", id).query("SELECT Payload FROM KysWorkspaceAudit WHERE RecordID=@ID");
  return result.recordset.map((row: { Payload: string }) => JSON.parse(row.Payload) as WorkspaceAudit).sort((a, b) => b.at.localeCompare(a.at));
}
export class WorkspaceError extends Error { constructor(message: string, public status = 400) { super(message); } }
function dateValid(value: string) { const parsed = new Date(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; }
export function validateWorkspaceInput(module: string, input: unknown): { data: Record<string, string>; status: string; version: number } {
  const config = WORKSPACES[module];
  if (!config) throw new WorkspaceError("Geçersiz kayıt türü.");
  if (!input || typeof input !== "object") throw new WorkspaceError("Geçersiz kayıt.");
  const body = input as { data?: Record<string, unknown>; status?: unknown; version?: unknown };
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) throw new WorkspaceError("Kayıt alanları eksik.");
  const status = String(body.status || "");
  if (!config.status.includes(status)) throw new WorkspaceError("Geçersiz durum.");
  const data: Record<string, string> = {};
  for (const field of config.fields) {
    const raw = body.data[field.key];
    if (raw != null && typeof raw !== "string" && typeof raw !== "number") throw new WorkspaceError(`${field.label}: geçersiz değer.`);
    const value = String(raw ?? "").trim();
    if (value.length > (field.type === "textarea" ? 12000 : 1000)) throw new WorkspaceError(`${field.label}: çok uzun.`);
    if (field.required && !value) throw new WorkspaceError(`${field.label} zorunludur.`);
    if (value && field.type === "date" && !dateValid(value)) throw new WorkspaceError(`${field.label}: geçerli tarih girin.`);
    if (value && field.type === "number" && !Number.isFinite(Number(value))) throw new WorkspaceError(`${field.label}: geçerli sayı girin.`);
    if (value && field.options && !field.options.includes(value)) throw new WorkspaceError(`${field.label}: geçersiz seçim.`);
    if (value && field.key === "evidence" && module !== "toplanti-kararlari" && !/^https:\/\//i.test(value)) throw new WorkspaceError("Kanıt bağlantısı HTTPS adresi olmalıdır.");
    data[field.key] = value;
  }
  if (module === "cihaz-listesi" && status === "Şartlı Kullanım" && !data.conditions) throw new WorkspaceError("Şartlı kullanım için kullanım kısıtları zorunludur.");
  if (module === "kalibrasyon-belirsizlikleri" && (Number(data.uncertainty) < 0 || Number(data.coverage) <= 0)) throw new WorkspaceError("U sıfır veya pozitif, k sıfırdan büyük olmalıdır.");
  if (["kalibrasyon-plani", "ara-kontrol-plani", "kalibrasyon-kontrol"].includes(module) && ["Uygun", "Uygun Değil"].includes(status) && (!data.performedAt || !data.evaluation)) throw new WorkspaceError("Tamamlanan kontroller için tarih ve teknik değerlendirme zorunludur.");
  if ((module === "kalibrasyon-plani" || module === "kalibrasyon-kontrol" && data.kind === "Kalibrasyon") && status === "Uygun" && (!data.certificate || !data.reviewer)) throw new WorkspaceError("Uygun kalibrasyon için sertifika ve değerlendiren kişi zorunludur.");
  if (module === "toplanti-kararlari" && status === "Tamamlandı" && (!data.completedAt || !data.evidence)) throw new WorkspaceError("Tamamlanan kararın gerçekleşme tarihi ve kanıtı zorunludur.");
  if (module === "yazilim-testleri" && status !== "Planlandı" && (!data.actual || !data.date || !data.evidence)) throw new WorkspaceError("Test sonucu, tarihi ve kanıt bağlantısı zorunludur.");
  if (module === "yeterlilik-testleri" && ["Başarılı", "Başarısız"].includes(status) && (!data.score || !data.evaluation || !data.performedAt)) throw new WorkspaceError("Skor, katılım tarihi ve teknik değerlendirme zorunludur.");
  if (data.nextDate && data.performedAt && data.nextDate <= data.performedAt) throw new WorkspaceError("Sonraki kontrol tarihi gerçekleşen tarihten sonra olmalıdır.");
  return { data, status, version: Number(body.version) || 0 };
}
export async function saveWorkspaceRecord(module: string, input: unknown, actor: { userId: string; userName: string }, id?: string) {
  const { data, status, version } = validateWorkspaceInput(module, input);
  await ensureWorkspaceSchema();
  const pool = await cosmoPool;
  const tx = await pool.transaction(); await tx.begin();
  try {
    // All validation/relations are checked inside one transaction. Update version is checked again in SQL.
    const rows = (await tx.request().query(hasMysqlConfig() ? "SELECT Payload FROM KysWorkspaceRecord FOR UPDATE" : "SELECT Payload FROM KysWorkspaceRecord WITH (UPDLOCK,HOLDLOCK)")).recordset.map((r: { Payload: string }) => JSON.parse(r.Payload) as WorkspaceRecord);
    const before = id ? rows.find((r: WorkspaceRecord) => r.id === id && r.module === module) : null;
    if (id && !before) throw new WorkspaceError("Kayıt bulunamadı.", 404);
    if (before && before.version !== version) throw new WorkspaceError("Kayıt başka biri tarafından güncellendi. Sayfayı yenileyin.", 409);
    for (const field of WORKSPACES[module].fields) if (field.relation && data[field.key] && !rows.some((r: WorkspaceRecord) => r.module === field.relation && r.id === data[field.key])) throw new WorkspaceError(`${field.label}: ilişkili kayıt bulunamadı.`);
    if (module === "cihaz-listesi" && rows.some((r: WorkspaceRecord) => r.module === module && r.id !== id && r.data.code.toLocaleLowerCase("tr-TR") === data.code.toLocaleLowerCase("tr-TR"))) throw new WorkspaceError("Bu cihaz kodu zaten kullanılıyor.", 409);
    if (module === "kalibrasyon-belirsizlikleri") {
      const calibration = rows.find((r: WorkspaceRecord) => r.id === data.calibrationId);
      if (!calibration || calibration.data.deviceId !== data.deviceId) throw new WorkspaceError("Kalibrasyon seçilen cihaza ait olmalıdır.");
      if (status === "Onaylandı" && (calibration.status !== "Uygun" || calibration.data.kind !== "Kalibrasyon")) throw new WorkspaceError("Belirsizlik onayı için kalibrasyon uygun olarak değerlendirilmelidir.");
    }
    if (module === "yazilim-dogrulama" && status === "Onaylandı") {
      const tests = rows.filter((r: WorkspaceRecord) => r.module === "yazilim-testleri" && r.data.validationId === id);
      if (!tests.length || tests.some((r: WorkspaceRecord) => r.status !== "Başarılı")) throw new WorkspaceError("Onay için bağlı testlerin tamamı başarılı olmalıdır.");
      if (!data.conclusion) throw new WorkspaceError("Kabul değerlendirmesi zorunludur.");
    }
    if (module === "yazilim-testleri") {
      const plan = rows.find((r: WorkspaceRecord) => r.id === data.validationId);
      if (plan?.status === "Onaylandı") throw new WorkspaceError("Onaylı planın testini değiştirmeden önce planı yeniden teste açın.");
    }
    if (module === "degisiklik-kontrolu" && status === "Yayında") {
      const plan = rows.find((r: WorkspaceRecord) => r.id === data.validationId);
      if (!plan || plan.status !== "Onaylandı" || plan.data.version !== data.version || !data.releasedAt) throw new WorkspaceError("Yayın için hedef sürümle eşleşen onaylı doğrulama ve yayın tarihi zorunludur.");
    }
    if (status === "Onaylandı" && ["yazilim-dogrulama", "kalibrasyon-belirsizlikleri", "degisiklik-kontrolu"].includes(module)) { data.reviewer = actor.userName; data.approvedAt = new Date().toISOString(); }
    const now = new Date().toISOString();
    const record: WorkspaceRecord = { id: id || randomUUID(), module, data, status, version: (before?.version || 0) + 1, createdAt: before?.createdAt || now, updatedAt: now, createdBy: before?.createdBy || actor.userName, updatedBy: actor.userName };
    const request = tx.request().input("ID", record.id).input("Module", module).input("Code", module === "cihaz-listesi" ? data.code : null).input("Version", record.version).input("Payload", JSON.stringify(record));
    if (before) {
      const result = await request.input("Previous", version).query("UPDATE KysWorkspaceRecord SET Payload=@Payload,Code=@Code,Version=@Version WHERE ID=@ID AND Module=@Module AND Version=@Previous");
      if (!result.rowsAffected?.[0]) throw new WorkspaceError("Kayıt güncellendi. Yenileyip tekrar deneyin.", 409);
    } else await request.query("INSERT INTO KysWorkspaceRecord (ID,Module,Code,Version,Payload) VALUES (@ID,@Module,@Code,@Version,@Payload)");
    const audit = { id: randomUUID(), recordId: record.id, actor: actor.userName, actorId: actor.userId, at: now, action: before ? "Güncellendi" : "Oluşturuldu", before, after: record };
    await tx.request().input("ID", audit.id).input("RecordID", record.id).input("Payload", JSON.stringify(audit)).query("INSERT INTO KysWorkspaceAudit (ID,RecordID,Payload) VALUES (@ID,@RecordID,@Payload)");
    await tx.commit(); return record;
  } catch (error) { await tx.rollback(); throw error; }
}
