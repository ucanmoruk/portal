import { ensureServiceDepartments } from "./serviceDepartments";
import type { Session } from "next-auth";
import { getUserPool } from "./userStore";
import { listKysBirimler } from "./kysStore";
import { cosmoPool } from "./db";

export class LabAccessError extends Error { readonly status = 403; }
export type LabScope = { departmentId: number | null; admin: boolean };
export async function getLabScope(session: Session): Promise<LabScope> {
  await ensureServiceDepartments();
  const id = Number(session.user?.userId);
  if (id === 2) return { departmentId: null, admin: true };
  if (!Number.isSafeInteger(id) || id <= 0) return { departmentId: null, admin: false };
  // Read current assignment on every request; an old login must not retain access.
  const pool = await getUserPool();
  const users = await pool.request().input("labUserId", id)
    .query("SELECT LaboratuvarBirimID FROM RootKullanici WHERE ID=@labUserId AND Durum='Aktif'");
  const unitId = Number(users.recordset[0]?.LaboratuvarBirimID);
  const units = await listKysBirimler();
  const unit = units.find(b => b.id === unitId && b.durum === "Aktif");
  if (!unit) return { departmentId: null, admin: false };
  const departmentId = unit.id;
  if (!Number.isSafeInteger(departmentId) || departmentId <= 0) return { departmentId: null, admin: false };
  return { departmentId, admin: false };
}
export function labScopeSql(scope: LabScope, alias = "s") {
  if (scope.admin) return "";
  if (scope.departmentId == null) return " AND 1=0";
  return ` AND ${alias}.BolumID=${scope.departmentId}`;
}
export async function assertLabServices(scope: LabScope, nkrId: number | null, ids: number[]) {
  if (scope.admin) return;
  if (scope.departmentId == null) throw new LabAccessError("Sonuç girişi için aktif laboratuvar biriminiz atanmalıdır.");
  if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new LabAccessError("Geçersiz analiz seçimi.");
  const pool = await cosmoPool;
  const result = await pool.request().input("labNkrId", nkrId).query(`SELECT x1.ID
    FROM NumuneX1 x1 INNER JOIN StokAnalizListesi s ON s.ID=x1.AnalizID
    WHERE (@labNkrId IS NULL OR x1.RaporID=@labNkrId) AND x1.ID IN (${[...new Set(ids)].join(",")}) ${labScopeSql(scope)}`);
  const allowed = new Set(result.recordset.map(row => Number(row.ID)));
  if (ids.some(id => !allowed.has(id))) throw new LabAccessError("Yalnızca kendi laboratuvar biriminizin analizlerine sonuç girebilirsiniz.");
}
export async function assertLabFormat(scope: LabScope, nkrId: number, format: string) {
  if (scope.admin) return;
  const pool = await cosmoPool;
  const normalized = format.toUpperCase().replace(/İ/g, "I").replace(/EN$/, "");
  const result = await pool.request().input("labNkrId", nkrId).input("labFormat", normalized).input("labFormatEn", `${normalized}EN`).query(`SELECT x1.ID
    FROM NumuneX1 x1 INNER JOIN StokAnalizListesi s ON s.ID=x1.AnalizID
    WHERE x1.RaporID=@labNkrId AND REPLACE(UPPER(COALESCE(NULLIF(s.RaporFormati,''),N'Genel')),N'İ',N'I') IN (@labFormat,@labFormatEn)`);
  await assertLabServices(scope, nkrId, result.recordset.map(row => Number(row.ID)));
}
