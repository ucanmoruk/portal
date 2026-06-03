import { notFound } from "next/navigation";
import poolPromise from "@/lib/db";
import LaboratuvarUgdrFormPageEn from "../LaboratuvarUgdrFormPageEn";

async function resolveLabRecord(idRaw: string) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("idRaw", idRaw)
    .query(`
      SELECT TOP 1 ID, CAST(RaporNo AS NVARCHAR(100)) AS RaporNo
      FROM NKR
      WHERE Durum = 'Aktif'
        AND (ID = TRY_CAST(@idRaw AS INT) OR CAST(RaporNo AS NVARCHAR(100)) = @idRaw)
      ORDER BY CASE WHEN CAST(RaporNo AS NVARCHAR(100)) = @idRaw THEN 0 ELSE 1 END, ID DESC
    `);
  const row = result.recordset?.[0];
  if (!row) return null;
  return { nkrId: String(row.ID), raporNo: row.RaporNo ? String(row.RaporNo) : null };
}

export default async function LaboratuvarUgdrDetayEnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await resolveLabRecord(id);
  if (!record) notFound();
  return <LaboratuvarUgdrFormPageEn nkrId={record.nkrId} displayLabel={record.raporNo ?? record.nkrId} />;
}
