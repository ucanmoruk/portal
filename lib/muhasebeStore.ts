import { cosmoPool, rootPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

export const MUHASEBE_PERIODS = ["Ekim", "Kasım", "Aralık", "2027"] as const;
export const MUHASEBE_RELATED = ["Root", "Unique", "Spektrotek", "Oğuzhan", "Selin"] as const;

type PortalUser = { userId: string; userName: string };
type Values = Record<string, number | null>;
type States = Record<string, "bekliyor" | "odendi">;
type DbRow = Record<string, unknown>;

let schemaReady: Promise<void> | null = null;
const field = (row: DbRow, key: string) => row[key] ?? row[key.toLowerCase()];
const parseJson = <T,>(value: unknown, fallback: T): T => {
  try { return value ? JSON.parse(String(value)) as T : fallback; } catch { return fallback; }
};

async function createSchema() {
  const pool = await rootPool;
  if (hasMysqlConfig()) {
    await pool.request().query(`CREATE TABLE IF NOT EXISTS PortalMuhasebePlan (
      ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      Aciklama VARCHAR(240) NOT NULL,
      Ilgili VARCHAR(40) NOT NULL,
      Gun TINYINT NOT NULL,
      TutarlarJson TEXT NOT NULL,
      DurumlarJson TEXT NOT NULL,
      KaynakTipi VARCHAR(20) NULL,
      FaturaID INT NULL,
      OlusturanID VARCHAR(80) NOT NULL,
      OlusturanAd VARCHAR(160) NOT NULL,
      CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY IX_PortalMuhasebePlan_Ilgili (Ilgili),
      KEY IX_PortalMuhasebePlan_Gun (Gun)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`);
    await pool.request().query("ALTER TABLE PortalMuhasebePlan ADD COLUMN IF NOT EXISTS KaynakTipi VARCHAR(20) NULL");
    await pool.request().query("ALTER TABLE PortalMuhasebePlan ADD COLUMN IF NOT EXISTS FaturaID INT NULL");
  } else {
    await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='PortalMuhasebePlan') CREATE TABLE PortalMuhasebePlan (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      Aciklama NVARCHAR(240) NOT NULL,
      Ilgili NVARCHAR(40) NOT NULL,
      Gun TINYINT NOT NULL,
      TutarlarJson NVARCHAR(MAX) NOT NULL,
      DurumlarJson NVARCHAR(MAX) NOT NULL,
      KaynakTipi NVARCHAR(20) NULL,
      FaturaID INT NULL,
      OlusturanID NVARCHAR(80) NOT NULL,
      OlusturanAd NVARCHAR(160) NOT NULL,
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
      UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
    )`);
    await pool.request().query("IF COL_LENGTH('PortalMuhasebePlan', 'KaynakTipi') IS NULL ALTER TABLE PortalMuhasebePlan ADD KaynakTipi NVARCHAR(20) NULL");
    await pool.request().query("IF COL_LENGTH('PortalMuhasebePlan', 'FaturaID') IS NULL ALTER TABLE PortalMuhasebePlan ADD FaturaID INT NULL");
  }
}

export async function ensureMuhasebeSchema() {
  schemaReady ??= createSchema().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}

function sanitizeValues(input: unknown): Values {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return Object.fromEntries(MUHASEBE_PERIODS.map((period) => {
    const raw = source[period];
    if (raw === "" || raw === null || raw === undefined) return [period, null];
    const amount = Number(raw);
    return [period, Number.isFinite(amount) && amount >= 0 ? amount : null];
  }));
}

function sanitizeStates(input: unknown, values: Values): States {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return Object.fromEntries(MUHASEBE_PERIODS.filter((period) => values[period] !== null).map((period) => [period, source[period] === "odendi" ? "odendi" : "bekliyor"])) as States;
}

function validate(input: Record<string, unknown>) {
  const aciklama = String(input.aciklama ?? "").trim();
  const ilgili = String(input.ilgili ?? "").trim();
  const gun = Number(input.gun);
  if (!aciklama) throw new Error("Açıklama zorunludur.");
  if (!MUHASEBE_RELATED.includes(ilgili as typeof MUHASEBE_RELATED[number])) throw new Error("İlgili seçimi geçersiz.");
  if (!Number.isInteger(gun) || gun < 1 || gun > 31) throw new Error("Gün 1 ile 31 arasında olmalıdır.");
  const tutarlar = sanitizeValues(input.tutarlar);
  return { aciklama: aciklama.slice(0, 240), ilgili, gun, tutarlar, durumlar: sanitizeStates(input.durumlar, tutarlar) };
}

const mapRow = (row: DbRow) => ({
  id: Number(field(row, "ID")),
  aciklama: String(field(row, "Aciklama") ?? ""),
  ilgili: String(field(row, "Ilgili") ?? ""),
  gun: Number(field(row, "Gun")),
  tutarlar: parseJson<Values>(field(row, "TutarlarJson"), {}),
  durumlar: parseJson<States>(field(row, "DurumlarJson"), {}),
  kaynakTipi: field(row, "KaynakTipi") ? String(field(row, "KaynakTipi")) : null,
  faturaId: field(row, "FaturaID") == null ? null : Number(field(row, "FaturaID")),
});

export async function listMuhasebeRows() {
  await ensureMuhasebeSchema();
  const pool = await rootPool;
  const result = await pool.request().query("SELECT ID,Aciklama,Ilgili,Gun,TutarlarJson,DurumlarJson,KaynakTipi,FaturaID FROM PortalMuhasebePlan ORDER BY ID ASC");
  return result.recordset.map(mapRow);
}

export async function createMuhasebeRow(input: Record<string, unknown>, user: PortalUser) {
  await ensureMuhasebeSchema();
  const row = validate(input);
  const pool = await rootPool;
  const result = await pool.request().input("Aciklama", row.aciklama).input("Ilgili", row.ilgili).input("Gun", row.gun)
    .input("Tutarlar", JSON.stringify(row.tutarlar)).input("Durumlar", JSON.stringify(row.durumlar))
    .input("UserID", user.userId).input("UserName", user.userName)
    .query("INSERT INTO PortalMuhasebePlan (Aciklama,Ilgili,Gun,TutarlarJson,DurumlarJson,OlusturanID,OlusturanAd) OUTPUT INSERTED.ID VALUES (@Aciklama,@Ilgili,@Gun,@Tutarlar,@Durumlar,@UserID,@UserName)");
  return { ...row, id: Number(result.recordset[0]?.ID) };
}

export async function updateMuhasebeRow(id: number, input: Record<string, unknown>) {
  await ensureMuhasebeSchema();
  if (!Number.isInteger(id) || id < 1) throw new Error("Geçersiz kayıt.");
  const row = validate(input);
  const pool = await rootPool;
  const linked = (await pool.request().input("ID", id).query("SELECT TOP 1 FaturaID,KaynakTipi,TutarlarJson,DurumlarJson FROM PortalMuhasebePlan WHERE ID=@ID")).recordset[0];
  await pool.request().input("ID", id).input("Aciklama", row.aciklama).input("Ilgili", row.ilgili).input("Gun", row.gun)
    .input("Tutarlar", JSON.stringify(row.tutarlar)).input("Durumlar", JSON.stringify(row.durumlar))
    .query(`UPDATE PortalMuhasebePlan SET Aciklama=@Aciklama,Ilgili=@Ilgili,Gun=@Gun,TutarlarJson=@Tutarlar,DurumlarJson=@Durumlar${hasMysqlConfig() ? "" : ",UpdatedAt=GETDATE()"} WHERE ID=@ID`);
  const oldAmounts = parseJson<Values>(linked ? field(linked, "TutarlarJson") : null, {});
  const oldStates = parseJson<States>(linked ? field(linked, "DurumlarJson") : null, {});
  const oldPeriod = MUHASEBE_PERIODS.find((period) => oldAmounts[period] != null);
  const newPeriod = MUHASEBE_PERIODS.find((period) => row.tutarlar[period] != null);
  const paymentStateChanged = Boolean(newPeriod && (oldPeriod !== newPeriod || oldStates[oldPeriod || newPeriod] !== row.durumlar[newPeriod]));
  return { ...row, id, paymentStateChanged, kaynakTipi: linked ? String(field(linked, "KaynakTipi") || "") || null : null, faturaId: linked && field(linked, "FaturaID") != null ? Number(field(linked, "FaturaID")) : null };
}

export async function deleteMuhasebeRow(id: number) {
  await ensureMuhasebeSchema();
  const pool = await rootPool;
  await pool.request().input("ID", id).query("DELETE FROM PortalMuhasebePlan WHERE ID=@ID");
}

function invoicePeriod(dueDate: string): typeof MUHASEBE_PERIODS[number] | null {
  const match = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  if (Number(match[1]) >= 2027) return "2027";
  return ({ "10": "Ekim", "11": "Kasım", "12": "Aralık" } as const)[match[2] as "10" | "11" | "12"] || null;
}

export async function syncPaymentInvoiceToMuhasebe(input: {
  faturaId: number; kaynak: string; faturaNo: string; firmaAd?: string | null;
  aciklama?: string | null; vadeTarihi: string; toplam: number; user?: PortalUser;
}) {
  await ensureMuhasebeSchema();
  const pool = await rootPool;
  const existing = (await pool.request().input("FaturaID", input.faturaId)
    .query("SELECT TOP 1 ID,Ilgili,DurumlarJson FROM PortalMuhasebePlan WHERE FaturaID=@FaturaID ORDER BY ID DESC")).recordset[0];
  if (input.kaynak !== "Ödeme") {
    if (existing) await pool.request().input("FaturaID", input.faturaId).query("DELETE FROM PortalMuhasebePlan WHERE FaturaID=@FaturaID");
    return;
  }
  const period = invoicePeriod(input.vadeTarihi);
  if (!period) {
    if (existing) await pool.request().input("FaturaID", input.faturaId).query("DELETE FROM PortalMuhasebePlan WHERE FaturaID=@FaturaID");
    return;
  }
  const day = Math.min(31, Math.max(1, Number(input.vadeTarihi.slice(8, 10)) || 1));
  const values = Object.fromEntries(MUHASEBE_PERIODS.map((item) => [item, item === period ? Number(input.toplam || 0) : null]));
  const oldStates = parseJson<States>(existing ? field(existing, "DurumlarJson") : null, {});
  const states = { [period]: oldStates[period] === "odendi" ? "odendi" : "bekliyor" };
  const description = [input.firmaAd, input.faturaNo, input.aciklama].map((item) => String(item || "").trim()).filter(Boolean).join(" · ").slice(0, 240) || `Fatura ${input.faturaNo}`;
  if (existing) {
    await pool.request().input("ID", Number(field(existing, "ID"))).input("Aciklama", description).input("Gun", day)
      .input("Tutarlar", JSON.stringify(values)).input("Durumlar", JSON.stringify(states))
      .query("UPDATE PortalMuhasebePlan SET Aciklama=@Aciklama,Gun=@Gun,TutarlarJson=@Tutarlar,DurumlarJson=@Durumlar,KaynakTipi='Fatura' WHERE ID=@ID");
  } else {
    const user = input.user || { userId: "system", userName: "Fatura Takip" };
    await pool.request().input("Aciklama", description).input("Gun", day).input("Tutarlar", JSON.stringify(values)).input("Durumlar", JSON.stringify(states))
      .input("UserID", user.userId).input("UserName", user.userName).input("FaturaID", input.faturaId)
      .query("INSERT INTO PortalMuhasebePlan (Aciklama,Ilgili,Gun,TutarlarJson,DurumlarJson,KaynakTipi,FaturaID,OlusturanID,OlusturanAd) VALUES (@Aciklama,'Unique',@Gun,@Tutarlar,@Durumlar,'Fatura',@FaturaID,@UserID,@UserName)");
  }
}

export async function syncFaturaRecordToMuhasebe(faturaId: number, user?: PortalUser) {
  const pool = await cosmoPool;
  const row = (await pool.request().input("FaturaID", faturaId).query(`
    SELECT TOP 1 f.ID,f.Fatura_No AS FaturaNo,f.Kaynak,f.VadeTarihi,f.Toplam,f.Aciklama,
      COALESCE(NULLIF(fr.Firma_Adi,''),NULLIF(f.FirmaAdManuel,''),'') AS FirmaAd
    FROM Fatura f LEFT JOIN Firma fr ON fr.ID=f.FaturaFirmaID
    WHERE f.ID=@FaturaID AND f.Durum='Aktif'
  `)).recordset[0];
  if (!row) return;
  await syncPaymentInvoiceToMuhasebe({
    faturaId: Number(field(row, "ID")), kaynak: String(field(row, "Kaynak") || "Unique"),
    faturaNo: String(field(row, "FaturaNo") || ""), firmaAd: String(field(row, "FirmaAd") || ""),
    aciklama: String(field(row, "Aciklama") || ""), vadeTarihi: String(field(row, "VadeTarihi") || "").slice(0, 10),
    toplam: Number(field(row, "Toplam") || 0), user,
  });
}

export async function syncMuhasebePaymentToInvoice(faturaId: number, paid: boolean) {
  const pool = await cosmoPool;
  const status = paid ? "Ödendi" : "Ödeme Bekliyor";
  await pool.request().input("FaturaID", faturaId).input("Durum", status)
    .query("INSERT INTO Odeme (Evrak_No,Odeme_Durumu,Fatura_ID,Tarih) SELECT ProformaNo,@Durum,ID,GETDATE() FROM Fatura WHERE ID=@FaturaID AND Durum='Aktif'");
  await pool.request().input("FaturaID", faturaId)
    .query(`UPDATE Fatura SET Odenen_Tutar=${paid ? "Toplam" : "0"} WHERE ID=@FaturaID AND Durum='Aktif'`);
}

export async function syncInvoicePaymentToMuhasebe(faturaId: number, paid: boolean) {
  await ensureMuhasebeSchema();
  const pool = await rootPool;
  const row = (await pool.request().input("FaturaID", faturaId)
    .query("SELECT TOP 1 ID,TutarlarJson,DurumlarJson FROM PortalMuhasebePlan WHERE FaturaID=@FaturaID ORDER BY ID DESC")).recordset[0];
  if (!row) return;
  const amounts = parseJson<Values>(field(row, "TutarlarJson"), {});
  const states = parseJson<States>(field(row, "DurumlarJson"), {});
  const period = MUHASEBE_PERIODS.find((item) => amounts[item] != null);
  if (!period) return;
  states[period] = paid ? "odendi" : "bekliyor";
  await pool.request().input("ID", Number(field(row, "ID"))).input("Durumlar", JSON.stringify(states))
    .query("UPDATE PortalMuhasebePlan SET DurumlarJson=@Durumlar WHERE ID=@ID");
}
