import { rootPool } from "@/lib/db";
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
      OlusturanID VARCHAR(80) NOT NULL,
      OlusturanAd VARCHAR(160) NOT NULL,
      CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY IX_PortalMuhasebePlan_Ilgili (Ilgili),
      KEY IX_PortalMuhasebePlan_Gun (Gun)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`);
  } else {
    await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='PortalMuhasebePlan') CREATE TABLE PortalMuhasebePlan (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      Aciklama NVARCHAR(240) NOT NULL,
      Ilgili NVARCHAR(40) NOT NULL,
      Gun TINYINT NOT NULL,
      TutarlarJson NVARCHAR(MAX) NOT NULL,
      DurumlarJson NVARCHAR(MAX) NOT NULL,
      OlusturanID NVARCHAR(80) NOT NULL,
      OlusturanAd NVARCHAR(160) NOT NULL,
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
      UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
    )`);
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
});

export async function listMuhasebeRows() {
  await ensureMuhasebeSchema();
  const pool = await rootPool;
  const result = await pool.request().query("SELECT ID,Aciklama,Ilgili,Gun,TutarlarJson,DurumlarJson FROM PortalMuhasebePlan ORDER BY ID ASC");
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
  await pool.request().input("ID", id).input("Aciklama", row.aciklama).input("Ilgili", row.ilgili).input("Gun", row.gun)
    .input("Tutarlar", JSON.stringify(row.tutarlar)).input("Durumlar", JSON.stringify(row.durumlar))
    .query(`UPDATE PortalMuhasebePlan SET Aciklama=@Aciklama,Ilgili=@Ilgili,Gun=@Gun,TutarlarJson=@Tutarlar,DurumlarJson=@Durumlar${hasMysqlConfig() ? "" : ",UpdatedAt=GETDATE()"} WHERE ID=@ID`);
  return { ...row, id };
}

export async function deleteMuhasebeRow(id: number) {
  await ensureMuhasebeSchema();
  const pool = await rootPool;
  await pool.request().input("ID", id).query("DELETE FROM PortalMuhasebePlan WHERE ID=@ID");
}
