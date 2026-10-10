import { cosmoPool } from "./db";
import { hasMysqlConfig } from "./mysqlCompat";
import { listKysBirimler } from "./kysStore";

let ready: Promise<void> | undefined;
export async function ensureServiceDepartments() {
  if (!ready) ready = (async () => {
    await listKysBirimler();
    const pool = await cosmoPool;
    const columns = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='StokAnalizListesi' AND COLUMN_NAME='BolumID'");
    if (!columns.recordset.length) await pool.request().query("ALTER TABLE StokAnalizListesi ADD BolumID INT NULL");
    const legacy = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='RootFirmaBirim'");
    if (!legacy.recordset.length) return;
    // Existing KYS IDs take precedence. Only recognizable legacy IDs migrate;
    // unassigned services and unrelated company departments remain untouched.
    const joins = `INNER JOIN RootFirmaBirim oldUnit ON oldUnit.ID=s.BolumID
      INNER JOIN KysLaboratuvarBirim unit ON LTRIM(RTRIM(unit.Ad))=LTRIM(RTRIM(oldUnit.Birim))
      LEFT JOIN KysLaboratuvarBirim currentUnit ON currentUnit.ID=s.BolumID`;
    await pool.request().query(hasMysqlConfig()
      ? `UPDATE StokAnalizListesi s ${joins} SET s.BolumID=unit.ID WHERE currentUnit.ID IS NULL`
      : `UPDATE s SET BolumID=unit.ID FROM StokAnalizListesi s ${joins} WHERE currentUnit.ID IS NULL`);
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}

export class ServiceDepartmentError extends Error { readonly status = 400; }
export async function validateServiceDepartment(value: unknown): Promise<number | null> {
  if (value == null || value === "") return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ServiceDepartmentError("Geçersiz laboratuvar birimi.");
  const units = await listKysBirimler();
  if (!units.some(unit => unit.id === id)) throw new ServiceDepartmentError("Bölüm KYS laboratuvar birimleri listesinden seçilmelidir.");
  return id;
}
