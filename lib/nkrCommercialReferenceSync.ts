type DbResult = {
  recordset?: Record<string, unknown>[];
};

type DbRequest = {
  input(name: string, value: unknown): DbRequest;
  query(sql: string): Promise<DbResult>;
};

type DbPool = {
  request(): DbRequest;
};

type ReferenceValue = string | number | null | undefined;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function replaceCsvValue(value: unknown, oldValue: string, newValue: string): string {
  const original = clean(value);
  const parts = original
    .split(",")
    .map(clean)
    .filter(Boolean);
  if (!parts.includes(oldValue)) return original;
  return parts.map((part) => part === oldValue ? newValue : part).join(", ");
}

/**
 * Bir NKR kaydının evrak/rapor numarası değiştiğinde yalnız o NKR'ye bağlı
 * ProformaNkr, Proforma başlığı/kalemleri, fatura ve ödeme referanslarını taşır.
 * Firma, fatura durumu ve ödeme durumu değerlerini değiştirmez.
 */
export async function syncNkrCommercialReferences(
  pool: DbPool,
  nkrId: number,
  previous: { evrakNo: ReferenceValue; raporNo: ReferenceValue },
  next: { evrakNo: ReferenceValue; raporNo: ReferenceValue },
): Promise<{ linkedProformas: number; changed: boolean }> {
  const oldEvrakNo = clean(previous.evrakNo);
  const newEvrakNo = clean(next.evrakNo);
  const oldRaporNo = clean(previous.raporNo);
  const newRaporNo = clean(next.raporNo);
  const evrakChanged = Boolean(oldEvrakNo && newEvrakNo && oldEvrakNo !== newEvrakNo);
  const raporChanged = Boolean(oldRaporNo && newRaporNo && oldRaporNo !== newRaporNo);
  if (!evrakChanged && !raporChanged) return { linkedProformas: 0, changed: false };

  const tableRows = await pool.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME IN ('ProformaNkr', 'ProformaBaslik', 'ProformaKalem', 'Fatura', 'Odeme')
      AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')
  `);
  const tables = new Set(
    (tableRows.recordset || []).map((row: { TABLE_NAME?: unknown }) => clean(row.TABLE_NAME).toLowerCase()),
  );
  if (!tables.has("proformankr")) return { linkedProformas: 0, changed: false };

  const linkedRows = await pool.request()
    .input("nkrId", nkrId)
    .query(`SELECT ID, ProformaID FROM ProformaNkr WHERE NkrID = @nkrId`);
  const proformaIds = Array.from(new Set(
    (linkedRows.recordset || []).map((row: { ProformaID?: unknown }) => Number(row.ProformaID)).filter(Number.isFinite),
  ));
  if (proformaIds.length === 0) return { linkedProformas: 0, changed: false };

  const linkUpdate = pool.request().input("nkrId", nkrId);
  const linkSets: string[] = [];
  if (evrakChanged) {
    linkUpdate.input("newEvrakNo", newEvrakNo);
    linkSets.push("EvrakNo = @newEvrakNo");
  }
  if (raporChanged) {
    linkUpdate.input("newRaporNo", newRaporNo);
    linkSets.push("RaporNo = @newRaporNo");
  }
  await linkUpdate.query(`UPDATE ProformaNkr SET ${linkSets.join(", ")} WHERE NkrID = @nkrId`);

  for (const proformaId of proformaIds) {
    if (raporChanged && tables.has("proformakalem")) {
      const itemRows = await pool.request()
        .input("proformaId", proformaId)
        .query(`SELECT ID, RaporNoListesi FROM ProformaKalem WHERE ProformaID = @proformaId`);
      for (const item of itemRows.recordset || []) {
        const replaced = replaceCsvValue(item.RaporNoListesi, oldRaporNo, newRaporNo);
        if (replaced === clean(item.RaporNoListesi)) continue;
        await pool.request()
          .input("id", Number(item.ID))
          .input("raporNoListesi", replaced || null)
          .query(`UPDATE ProformaKalem SET RaporNoListesi = @raporNoListesi WHERE ID = @id`);
      }
    }

    if (!evrakChanged) continue;

    const proformaRow = tables.has("proformabaslik")
      ? (await pool.request()
          .input("proformaId", proformaId)
          .query(`SELECT TOP 1 ProformaNo, EvrakNo FROM ProformaBaslik WHERE ID = @proformaId`)).recordset?.[0]
      : null;

    const invoiceRows = tables.has("fatura") && proformaRow
      ? (await pool.request()
          .input("oldEvrakNo", oldEvrakNo)
          .input("proformaNo", clean(proformaRow.ProformaNo))
          .query(`
            SELECT ID, ProformaNo FROM Fatura
            WHERE Durum = 'Aktif' AND (ProformaNo = @oldEvrakNo OR ProformaNo = @proformaNo)
          `)).recordset || []
      : [];

    const distinctLinks = await pool.request()
      .input("proformaId", proformaId)
      .query(`
        SELECT DISTINCT EvrakNo FROM ProformaNkr
        WHERE ProformaID = @proformaId AND EvrakNo IS NOT NULL AND EvrakNo <> ''
        ORDER BY EvrakNo
      `);
    const linkedEvrakNos = (distinctLinks.recordset || []).map((row: { EvrakNo?: unknown }) => clean(row.EvrakNo)).filter(Boolean);
    const headerEvrakNo = linkedEvrakNos.length <= 1
      ? (linkedEvrakNos[0] || newEvrakNo)
      : `Çoklu (${linkedEvrakNos.length} evrak)`;

    if (proformaRow && tables.has("proformabaslik")) {
      await pool.request()
        .input("proformaId", proformaId)
        .input("evrakNo", headerEvrakNo)
        .query(`UPDATE ProformaBaslik SET EvrakNo = @evrakNo WHERE ID = @proformaId`);
    }

    for (const invoice of invoiceRows) {
      const invoiceId = Number(invoice.ID);
      if (clean(invoice.ProformaNo) === oldEvrakNo) {
        await pool.request()
          .input("invoiceId", invoiceId)
          .input("newEvrakNo", newEvrakNo)
          .query(`UPDATE Fatura SET ProformaNo = @newEvrakNo WHERE ID = @invoiceId`);
      }
      if (!tables.has("odeme")) continue;
      const oldPayments = await pool.request()
        .input("invoiceId", invoiceId)
        .input("oldEvrakNo", oldEvrakNo)
        .query(`SELECT ID, Odeme_Durumu FROM Odeme WHERE Fatura_ID = @invoiceId AND Evrak_No = @oldEvrakNo ORDER BY ID`);
      for (const payment of oldPayments.recordset || []) {
        const duplicate = await pool.request()
          .input("invoiceId", invoiceId)
          .input("newEvrakNo", newEvrakNo)
          .input("status", clean(payment.Odeme_Durumu))
          .query(`
            SELECT TOP 1 ID FROM Odeme
            WHERE Fatura_ID = @invoiceId AND Evrak_No = @newEvrakNo AND Odeme_Durumu = @status
          `);
        if (duplicate.recordset?.length) {
          await pool.request().input("id", Number(payment.ID)).query(`DELETE FROM Odeme WHERE ID = @id`);
        } else {
          await pool.request()
            .input("id", Number(payment.ID))
            .input("newEvrakNo", newEvrakNo)
            .query(`UPDATE Odeme SET Evrak_No = @newEvrakNo WHERE ID = @id`);
        }
      }
    }
  }

  if (evrakChanged && tables.has("odeme")) {
    const remainingOldLinks = await pool.request()
      .input("oldEvrakNo", oldEvrakNo)
      .query(`SELECT TOP 1 ID FROM ProformaNkr WHERE EvrakNo = @oldEvrakNo`);
    if (!remainingOldLinks.recordset?.length) {
      await pool.request()
        .input("oldEvrakNo", oldEvrakNo)
        .input("newEvrakNo", newEvrakNo)
        .query(`
          UPDATE Odeme SET Evrak_No = @newEvrakNo
          WHERE Fatura_ID IS NULL AND Evrak_No = @oldEvrakNo AND Odeme_Durumu = N'Proforma'
        `);
    }
  }

  return { linkedProformas: proformaIds.length, changed: true };
}
