type RequestSource = { request(): any };

export async function withUgdTransaction<T>(pool: any, work: (transaction: RequestSource) => Promise<T>): Promise<T> {
  const transaction = await pool.transaction();
  await transaction.begin();
  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}

export async function saveUgdFormulaRows(pool: RequestSource, productId: number, rows: any[]) {
  if (!Number.isInteger(productId) || productId <= 0 || !Array.isArray(rows)) throw new Error("Geçersiz formül kaydı.");
  const product = await pool.request().input("id", productId)
    .query("SELECT ID FROM rUGDListe WHERE ID = @id AND Durum = 'Aktif'");
  if (!product.recordset.length) throw new Error("Formülün ürün kaydı bulunamadı.");
  await pool.request().input("urunId", productId).query("DELETE FROM rUGDFormul WHERE UrunID = @urunId");
  for (const row of rows) {
    await pool.request()
      .input("urunId", productId)
      .input("hammaddeId", row.cosingId ?? row.HammaddeID ?? null)
      .input("inciName", row.INCIName ?? row.inputName ?? "")
      .input("miktar", String(row.inputAmount ?? row.miktar ?? row.Miktar ?? "0"))
      .input("dap", row.dap ?? row.DaP ?? 100)
      .input("noael", row.noael ?? row.Noael ?? null)
      .query(`INSERT INTO rUGDFormul (UrunID, HammaddeID, INCIName, Miktar, DaP, Noael)
        VALUES (@urunId, @hammaddeId, @inciName, @miktar, @dap, @noael)`);
  }
}
