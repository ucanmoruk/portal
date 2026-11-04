import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
let ready: Promise<void> | null = null;
export function ensureTeklifPackageSchema() {
  if (!ready) ready = (async () => {
    const pool = await cosmoPool;
    await pool.request().query(hasMysqlConfig()
      ? "ALTER TABLE TeklifKalem ADD COLUMN IF NOT EXISTS PaketGrup VARCHAR(64) NULL, ADD COLUMN IF NOT EXISTS PaketAdi VARCHAR(300) NULL"
      : "IF COL_LENGTH('TeklifKalem','PaketGrup') IS NULL ALTER TABLE TeklifKalem ADD PaketGrup NVARCHAR(64) NULL; IF COL_LENGTH('TeklifKalem','PaketAdi') IS NULL ALTER TABLE TeklifKalem ADD PaketAdi NVARCHAR(300) NULL");
  })().catch(error => { ready = null; throw error; });
  return ready;
}
export function packageInput(row: { paketGrup?: unknown; paketAdi?: unknown }) {
  if (!row.paketGrup && !row.paketAdi) return { group: null, title: null };
  if (typeof row.paketGrup !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(row.paketGrup) || typeof row.paketAdi !== "string" || !row.paketAdi.trim() || row.paketAdi.trim().length > 300) throw new Error("Geçersiz paket başlığı.");
  return { group: row.paketGrup, title: row.paketAdi.trim() };
}
