/* eslint-disable @typescript-eslint/no-explicit-any */
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { ensureKysSchema } from "@/lib/kysStore";
let ready: Promise<void> | null = null;
export async function ensureKysPurchaseSchema() {
  await ensureKysSchema();
  if (!ready)
    ready = (async () => {
      const p = await cosmoPool;
      if (hasMysqlConfig()) {
        await p.request().query(`CREATE TABLE IF NOT EXISTS KysTedarikci (
        ID INT AUTO_INCREMENT PRIMARY KEY, Ad VARCHAR(220) NOT NULL, Yetkili VARCHAR(160) NULL,
        Telefon VARCHAR(80) NULL, Email VARCHAR(220) NULL, Adres TEXT NULL, VergiDairesi VARCHAR(160) NULL,
        VergiNo VARCHAR(80) NULL, Durum VARCHAR(20) NOT NULL DEFAULT 'Aktif', CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        await p
          .request()
          .query(
            "ALTER TABLE KysTalepKabul ADD COLUMN IF NOT EXISTS TedarikciID INT NULL",
          );
        await p.request().query(`CREATE TABLE IF NOT EXISTS KysTalepBelge (
        ID INT AUTO_INCREMENT PRIMARY KEY, TalepID INT NOT NULL, KabulID INT NOT NULL,
        DosyaAdi VARCHAR(220) NOT NULL, MimeType VARCHAR(100) NOT NULL, FileData LONGBLOB NOT NULL,
        YukleyenID VARCHAR(80) NULL, CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, KEY IX_TalepBelge(TalepID,KabulID))`);
        await p.request()
          .query(`CREATE TABLE IF NOT EXISTS KysTalepDuzeltmeLog (
        ID INT AUTO_INCREMENT PRIMARY KEY, TalepID INT NOT NULL, KabulID INT NULL,
        Onceki LONGTEXT NOT NULL, Sonraki LONGTEXT NOT NULL, Aciklama TEXT NULL,
        KullaniciID VARCHAR(80) NULL, CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        // Newly introduced tables must retain Turkish names and audit text.
        for (const table of ["KysTedarikci", "KysTalepBelge", "KysTalepDuzeltmeLog"]) {
          const result = await p.request().input("Table", table).query("SELECT TABLE_COLLATION FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=@Table");
          if (result.recordset[0]?.TABLE_COLLATION !== "utf8mb4_turkish_ci") {
            await p.request().query(`ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci`);
          }
        }
      } else {
        await p.request()
          .query(`IF OBJECT_ID('KysTedarikci','U') IS NULL CREATE TABLE KysTedarikci (
        ID INT IDENTITY PRIMARY KEY, Ad NVARCHAR(220) NOT NULL, Yetkili NVARCHAR(160) NULL,
        Telefon NVARCHAR(80) NULL, Email NVARCHAR(220) NULL, Adres NVARCHAR(MAX) NULL,
        VergiDairesi NVARCHAR(160) NULL, VergiNo NVARCHAR(80) NULL, Durum NVARCHAR(20) NOT NULL DEFAULT 'Aktif', CreatedAt DATETIME DEFAULT GETDATE())`);
        await p
          .request()
          .query(
            "IF COL_LENGTH('KysTalepKabul','TedarikciID') IS NULL ALTER TABLE KysTalepKabul ADD TedarikciID INT NULL",
          );
        await p.request()
          .query(`IF OBJECT_ID('KysTalepBelge','U') IS NULL CREATE TABLE KysTalepBelge (
        ID INT IDENTITY PRIMARY KEY, TalepID INT NOT NULL, KabulID INT NOT NULL, DosyaAdi NVARCHAR(220) NOT NULL,
        MimeType NVARCHAR(100) NOT NULL, FileData VARBINARY(MAX) NOT NULL, YukleyenID NVARCHAR(80) NULL, CreatedAt DATETIME DEFAULT GETDATE())`);
        await p.request()
          .query(`IF OBJECT_ID('KysTalepDuzeltmeLog','U') IS NULL CREATE TABLE KysTalepDuzeltmeLog (
        ID INT IDENTITY PRIMARY KEY, TalepID INT NOT NULL, KabulID INT NULL, Onceki NVARCHAR(MAX) NOT NULL,
        Sonraki NVARCHAR(MAX) NOT NULL, Aciklama NVARCHAR(MAX) NULL, KullaniciID NVARCHAR(80) NULL, CreatedAt DATETIME DEFAULT GETDATE())`);
      }
    })().catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}
const clean = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  const s = clean(v);
  const n = Number(
    s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s,
  );
  if (!Number.isFinite(n)) throw new Error("Geçerli bir sayı girin.");
  return n;
};
export async function resolveKysSupplier(p: any, id: unknown) {
  if (!id) return null;
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0)
    throw new Error("Geçerli tedarikçi seçin.");
  const r = (
    await p
      .request()
      .input("ID", Number(id))
      .query("SELECT ID,Ad FROM KysTedarikci WHERE ID=@ID AND Durum='Aktif'")
  ).recordset[0];
  if (!r) throw new Error("Tedarikçi bulunamadı veya pasif.");
  return { id: Number(r.ID), ad: r.Ad };
}
export async function listKysSuppliers(search = "", includeInactive = false) {
  await ensureKysPurchaseSchema();
  const p = await cosmoPool;
  return (
    await p.request().input("Search", `%${clean(search)}%`)
      .query(`SELECT * FROM KysTedarikci
    WHERE ${includeInactive ? "1=1" : "Durum='Aktif'"} AND (Ad LIKE @Search OR VergiNo LIKE @Search OR Yetkili LIKE @Search) ORDER BY Ad,ID`)
  ).recordset;
}
export async function saveKysSupplier(input: any, id?: number) {
  await ensureKysPurchaseSchema();
  const p = await cosmoPool;
  const fields = [
    "Ad",
    "Yetkili",
    "Telefon",
    "Email",
    "Adres",
    "VergiDairesi",
    "VergiNo",
  ];
  if (!clean(input.Ad) || clean(input.Ad).length > 220)
    throw new Error("Firma adı zorunludur (en fazla 220 karakter).");
  if (
    clean(input.Email) &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(input.Email))
  )
    throw new Error("E-posta adresi geçersiz.");
  const req = p.request();
  fields.forEach((k) => req.input(k, clean(input[k]) || null));
  if (id) {
    req
      .input("ID", id)
      .input("Durum", input.Durum === "Pasif" ? "Pasif" : "Aktif");
    const result = await req.query(
      `UPDATE KysTedarikci SET ${fields.map((k) => `${k}=@${k}`).join(",")},Durum=@Durum WHERE ID=@ID`,
    );
    if (!result.rowsAffected?.[0]) throw new Error("Tedarikçi bulunamadı.");
    return id;
  }
  return Number(
    (
      await req.query(
        `INSERT INTO KysTedarikci (${fields.join(",")}) OUTPUT INSERTED.ID VALUES (${fields.map((k) => `@${k}`).join(",")})`,
      )
    ).recordset[0]?.ID,
  );
}
export async function removeKysSupplier(id: number) {
  await ensureKysPurchaseSchema();
  const p = await cosmoPool;
  // Referenced supplier identities remain available in purchase history.
  await p
    .request()
    .input("ID", id)
    .query("UPDATE KysTedarikci SET Durum='Pasif' WHERE ID=@ID");
}
export type AcceptanceFile = { name: string; mime: string; buffer: Buffer };
export async function readKysAcceptanceInput(request: Request): Promise<any> {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    const input = await request.json();
    if (!input || typeof input !== "object") throw new Error("Geçersiz kabul.");
    delete input.belge;
    return input;
  }
  const form = await request.formData();
  const raw = form.get("payload");
  if (typeof raw !== "string") throw new Error("Kabul bilgileri eksik.");
  const input = JSON.parse(raw);
  if (!input || typeof input !== "object") throw new Error("Geçersiz kabul.");
  const file = form.get("belge");
  if (file instanceof File && file.size) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Belge en fazla 10 MB olabilir.");
    const ext = file.name.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
    };
    if (!ext || !types[ext])
      throw new Error("PDF, Word, Excel, PNG veya JPG yükleyin.");
    input.belge = {
      name: file.name.replace(/[\\/\r\n\x00]/g, "_").slice(0, 220),
      mime: types[ext],
      buffer: Buffer.from(await file.arrayBuffer()),
    };
  }
  return input;
}
export async function saveKysAcceptanceFile(
  p: any,
  talepId: number,
  kabulId: number,
  file: AcceptanceFile,
  userId: string | null,
) {
  await p
    .request()
    .input("TalepID", talepId)
    .input("KabulID", kabulId)
    .input("Name", file.name)
    .input("Mime", file.mime)
    .input("Data", file.buffer)
    .input("UserID", userId)
    .query(
      "INSERT INTO KysTalepBelge (TalepID,KabulID,DosyaAdi,MimeType,FileData,YukleyenID) VALUES (@TalepID,@KabulID,@Name,@Mime,@Data,@UserID)",
    );
}
export async function getKysRequestFiles(talepId: number) {
  await ensureKysPurchaseSchema();
  const p = await cosmoPool;
  return (
    await p
      .request()
      .input("ID", talepId)
      .query(
        "SELECT ID,KabulID,DosyaAdi,CreatedAt FROM KysTalepBelge WHERE TalepID=@ID ORDER BY ID DESC",
      )
  ).recordset;
}
async function log(
  p: any,
  talepId: number,
  kabulId: number | null,
  before: any,
  after: any,
  input: any,
) {
  await p
    .request()
    .input("TalepID", talepId)
    .input("KabulID", kabulId)
    .input("Before", JSON.stringify(before))
    .input("After", JSON.stringify(after))
    .input(
      "Reason",
      clean(input.duzeltmeAciklamasi) || "Talep silindi (arşivlendi)",
    )
    .input("User", input.degerlendirenId || null)
    .query(
      "INSERT INTO KysTalepDuzeltmeLog (TalepID,KabulID,Onceki,Sonraki,Aciklama,KullaniciID) VALUES (@TalepID,@KabulID,@Before,@After,@Reason,@User)",
    );
}
export async function deleteKysRequest(id: number, userId: string) {
  await ensureKysPurchaseSchema();
  const base = await cosmoPool;
  const tx = await base.transaction();
  await tx.begin();
  try {
    const row = (
      await tx
        .request()
        .input("ID", id)
        .query(
          hasMysqlConfig()
            ? "SELECT * FROM KysTalep WHERE ID=@ID FOR UPDATE"
            : "SELECT * FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID",
        )
    ).recordset[0];
    if (!row || row.Durum === "Silindi") throw new Error("Talep bulunamadı.");
    const accepted = (await tx.request().input("ID", id).query(`
      SELECT k.ID, k.StokID, k.HareketID, k.GelenMiktar,
             h.Miktar, h.HareketTipi, h.HedefBirimID, h.KaynakBirimID
      FROM KysTalepKabul k LEFT JOIN KysStokHareket h ON h.ID=k.HareketID
      WHERE k.TalepID=@ID ORDER BY k.StokID, k.HareketID
    `)).recordset;
    const stockTotals = new Map<number, number>();
    const seenMovements = new Set<number>();
    for (const acceptance of accepted) {
      const stockId = Number(acceptance.StokID);
      const quantity = Number(acceptance.GelenMiktar);
      if (!stockId || !acceptance.HareketID || seenMovements.has(Number(acceptance.HareketID)) ||
          !["Kabul", "Çıkış"].includes(acceptance.HareketTipi) || !Number.isFinite(quantity) || quantity <= 0 ||
          Math.abs(Number(acceptance.Miktar) - quantity) > 0.00001) {
        throw new Error("Kabul ve stok hareketi eşleşmiyor. Talep silinmeden önce kayıtları kontrol edin.");
      }
      seenMovements.add(Number(acceptance.HareketID));
      stockTotals.set(stockId, (stockTotals.get(stockId) || 0) + (acceptance.HareketTipi === "Çıkış" ? -quantity : quantity));
    }
    for (const [stockId, quantity] of stockTotals) {
      const stock = (await tx.request().input("ID", stockId).query(hasMysqlConfig()
        ? "SELECT StokMiktari FROM KysStokKart WHERE ID=@ID FOR UPDATE"
        : "SELECT StokMiktari FROM KysStokKart WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID")).recordset[0];
      if (!stock || Number(stock.StokMiktari) - quantity < -0.00001) {
        throw new Error("Kabul edilen stok kullanılmış. Talebin silinmesi stok miktarını negatife düşüreceği için işlem yapılamadı.");
      }
      await tx.request().input("ID", stockId).input("D", -quantity)
        .query("UPDATE KysStokKart SET StokMiktari=StokMiktari+@D,UpdatedAt=GETDATE() WHERE ID=@ID");
    }
    for (const acceptance of accepted) {
      await balance(tx, Number(acceptance.StokID), acceptance.HedefBirimID == null
        ? (acceptance.KaynakBirimID == null ? null : Number(acceptance.KaynakBirimID))
        : Number(acceptance.HedefBirimID), (acceptance.HareketTipi === "Çıkış" ? 1 : -1) * Number(acceptance.GelenMiktar));
    }
    // Purchases are stored on acceptances. Remove their files/movements first.
    for (const statement of [
      "DELETE FROM KysTalepBelge WHERE TalepID=@ID",
      "DELETE FROM KysStokSertifika WHERE HareketID IN (SELECT HareketID FROM KysTalepKabul WHERE TalepID=@ID)",
      "DELETE FROM KysStokHareket WHERE ID IN (SELECT HareketID FROM KysTalepKabul WHERE TalepID=@ID)",
      "DELETE FROM KysTalepKabul WHERE TalepID=@ID",
      "DELETE FROM KysTalepKalem WHERE TalepID=@ID",
      "DELETE FROM KysTalepDuzeltmeLog WHERE TalepID=@ID",
      "DELETE FROM KysTalep WHERE ID=@ID",
    ]) await tx.request().input("ID", id).query(statement);
    await log(
      tx,
      id,
      null,
      row,
      { silindi: true, kabulKayitSayisi: accepted.length },
      { degerlendirenId: userId, duzeltmeAciklamasi: "Talep ve bağlı kabul/satın alma kayıtları silindi; kabul miktarları stoktan geri alındı." },
    );
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
export async function restoreKysRequest(id: number, userId: string) {
  await ensureKysPurchaseSchema();
  const base = await cosmoPool;
  const tx = await base.transaction();
  await tx.begin();
  try {
    const row = (
      await tx
        .request()
        .input("ID", id)
        .query(
          hasMysqlConfig()
            ? "SELECT * FROM KysTalep WHERE ID=@ID FOR UPDATE"
            : "SELECT * FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID",
        )
    ).recordset[0];
    if (!row || row.Durum !== "Silindi")
      throw new Error("Geri alınabilecek silinmiş talep yok.");
    const last = (
      await tx
        .request()
        .input("ID", id)
        .query(
          "SELECT TOP 1 Onceki FROM KysTalepDuzeltmeLog WHERE TalepID=@ID AND KabulID IS NULL ORDER BY ID DESC",
        )
    ).recordset[0];
    const previous = last ? JSON.parse(last.Onceki) : null;
    if (
      !previous ||
      ![
        "Onay Bekliyor",
        "Onaylandı",
        "İşleme Alındı",
        "Kısmi Kabul",
        "Tamamlandı",
        "İptal",
      ].includes(previous.Durum)
    )
      throw new Error("Önceki talep durumu bulunamadı.");
    await tx
      .request()
      .input("ID", id)
      .input("Status", previous.Durum)
      .query(
        "UPDATE KysTalep SET Durum=@Status,UpdatedAt=GETDATE() WHERE ID=@ID",
      );
    await log(
      tx,
      id,
      null,
      row,
      { ...row, Durum: previous.Durum },
      {
        degerlendirenId: userId,
        duzeltmeAciklamasi: "Silinen talep geri alındı",
      },
    );
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
async function balance(
  p: any,
  stokId: number,
  unitId: number | null,
  delta: number,
) {
  if (!unitId || !delta) return;
  const r = (
    await p
      .request()
      .input("S", stokId)
      .input("U", unitId)
      .query(
        hasMysqlConfig()
          ? "SELECT ID,Miktar FROM KysStokBirimMiktar WHERE StokID=@S AND BirimID=@U FOR UPDATE"
          : "SELECT ID,Miktar FROM KysStokBirimMiktar WITH (UPDLOCK,HOLDLOCK) WHERE StokID=@S AND BirimID=@U",
      )
  ).recordset[0];
  if (Number(r?.Miktar || 0) + delta < -0.00001)
    throw new Error(
      "Düzeltme ilgili birimin stok miktarını negatife düşürüyor. Kullanılmış stok önce kontrol edilmelidir.",
    );
  const req = p
    .request()
    .input("S", stokId)
    .input("U", unitId)
    .input("D", delta);
  await req.query(
    r
      ? "UPDATE KysStokBirimMiktar SET Miktar=Miktar+@D WHERE StokID=@S AND BirimID=@U"
      : "INSERT INTO KysStokBirimMiktar (StokID,BirimID,Miktar) VALUES (@S,@U,@D)",
  );
}
export async function deleteKysAcceptance(talepId: number, kabulId: number, userId: string) {
  await ensureKysPurchaseSchema();
  if (!Number.isSafeInteger(kabulId) || kabulId <= 0) throw new Error("Geçerli kabul kaydı seçin.");
  const base = await cosmoPool;
  const tx = await base.transaction();
  await tx.begin();
  try {
    const parent = (await tx.request().input("ID", talepId).query(hasMysqlConfig()
      ? "SELECT * FROM KysTalep WHERE ID=@ID FOR UPDATE"
      : "SELECT * FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID")).recordset[0];
    if (!parent || parent.Durum === "Silindi") throw new Error("Talep bulunamadı.");
    const before = (await tx.request().input("ID", kabulId).input("TalepID", talepId)
      .query("SELECT * FROM KysTalepKabul WHERE ID=@ID AND TalepID=@TalepID")).recordset[0];
    if (!before) throw new Error("Kabul kaydı bulunamadı.");
    const movement = (await tx.request().input("ID", before.HareketID)
      .query("SELECT * FROM KysStokHareket WHERE ID=@ID")).recordset[0];
    const item = (await tx.request().input("ID", before.KalemID).input("TalepID", talepId)
      .query("SELECT * FROM KysTalepKalem WHERE ID=@ID AND TalepID=@TalepID")).recordset[0];
    const quantity = Number(before.GelenMiktar);
    const reversal = movement?.HareketTipi === "Çıkış" ? quantity : -quantity;
    if (!movement || !item || !["Kabul", "Çıkış"].includes(movement.HareketTipi) || Number(movement.StokID) !== Number(before.StokID) ||
        !Number.isFinite(quantity) || quantity <= 0 || Math.abs(Number(movement.Miktar) - quantity) > 0.00001 ||
        Number(item.KabulMiktari) - quantity < -0.00001) throw new Error("Kabul ve stok kayıtları eşleşmiyor.");
    const stock = (await tx.request().input("ID", before.StokID).query(hasMysqlConfig()
      ? "SELECT * FROM KysStokKart WHERE ID=@ID FOR UPDATE"
      : "SELECT * FROM KysStokKart WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID")).recordset[0];
    if (!stock || Number(stock.StokMiktari) + reversal < -0.00001) throw new Error("Kabul edilen stok kullanılmış; silme işlemi stok miktarını negatife düşüremez.");
    await tx.request().input("ID", before.StokID).input("D", reversal)
      .query("UPDATE KysStokKart SET StokMiktari=StokMiktari+@D,UpdatedAt=GETDATE() WHERE ID=@ID");
    await balance(tx, Number(before.StokID), movement.HedefBirimID == null
      ? (movement.KaynakBirimID == null ? null : Number(movement.KaynakBirimID)) : Number(movement.HedefBirimID), reversal);
    await tx.request().input("ID", kabulId).query("DELETE FROM KysTalepBelge WHERE KabulID=@ID");
    await tx.request().input("ID", before.HareketID).query("DELETE FROM KysStokSertifika WHERE HareketID=@ID");
    await tx.request().input("ID", before.HareketID).query("DELETE FROM KysStokHareket WHERE ID=@ID");
    await tx.request().input("ID", kabulId).input("TalepID", talepId).query("DELETE FROM KysTalepKabul WHERE ID=@ID AND TalepID=@TalepID");
    await tx.request().input("ID", before.KalemID).input("Q", Math.max(0, Number(item.KabulMiktari) - quantity))
      .query("UPDATE KysTalepKalem SET KabulMiktari=@Q,Durum=CASE WHEN @Q=0 THEN 'Bekliyor' WHEN @Q>=Miktar THEN 'Tamamlandı' ELSE 'Kısmi Kabul' END WHERE ID=@ID");
    if (parent.Durum !== "İptal") await tx.request().input("ID", talepId).query("UPDATE KysTalep SET Durum=CASE WHEN NOT EXISTS(SELECT 1 FROM KysTalepKalem WHERE TalepID=@ID AND KabulMiktari>0) THEN 'Onaylandı' WHEN NOT EXISTS(SELECT 1 FROM KysTalepKalem WHERE TalepID=@ID AND Durum<>'Tamamlandı') THEN 'Tamamlandı' ELSE 'Kısmi Kabul' END,UpdatedAt=GETDATE() WHERE ID=@ID");
    await log(tx, talepId, kabulId, before, { silindi: true }, { degerlendirenId: userId, duzeltmeAciklamasi: "Hatalı stok kabulü silindi; stok miktarı geri alındı." });
    await tx.commit();
    return { ok: true };
  } catch (e) { await tx.rollback(); throw e; }
}

export async function correctKysAcceptance(
  talepId: number,
  input: any,
  purchasePermission: boolean,
) {
  await ensureKysPurchaseSchema();
  if (!clean(input.duzeltmeAciklamasi))
    throw new Error("Düzeltme açıklaması zorunludur.");
  const quantity = num(input.gelenMiktar);
  if (quantity <= 0) throw new Error("Gelen miktar pozitif olmalıdır.");
  const base = await cosmoPool;
  const tx = await base.transaction();
  await tx.begin();
  try {
    const parent = (
      await tx
        .request()
        .input("ID", talepId)
        .query(
          hasMysqlConfig()
            ? "SELECT * FROM KysTalep WHERE ID=@ID FOR UPDATE"
            : "SELECT * FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID",
        )
    ).recordset[0];
    if (!parent || ["İptal", "Silindi"].includes(parent.Durum))
      throw new Error("Talep düzeltmeye uygun değil.");
    const before = (
      await tx
        .request()
        .input("ID", Number(input.kabulId))
        .input("TalepID", talepId)
        .query("SELECT * FROM KysTalepKabul WHERE ID=@ID AND TalepID=@TalepID")
    ).recordset[0];
    if (!before) throw new Error("Kabul kaydı bulunamadı.");
    const movement = (
      await tx
        .request()
        .input("ID", before.HareketID)
        .query("SELECT * FROM KysStokHareket WHERE ID=@ID")
    ).recordset[0];
    const item = (
      await tx
        .request()
        .input("ID", before.KalemID)
        .query("SELECT * FROM KysTalepKalem WHERE ID=@ID")
    ).recordset[0];
    if (!movement || !item)
      throw new Error("Stok hareketi veya kalem bulunamadı.");
    const delta = quantity - Number(before.GelenMiktar);
    const sign = movement.HareketTipi === "Çıkış" ? -1 : 1;
    const stockDelta = sign * delta;
    const stock = (
      await tx
        .request()
        .input("ID", before.StokID)
        .query(
          hasMysqlConfig()
            ? "SELECT * FROM KysStokKart WHERE ID=@ID FOR UPDATE"
            : "SELECT * FROM KysStokKart WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID",
        )
    ).recordset[0];
    if (!stock || Number(stock.StokMiktari) + stockDelta < -0.00001)
      throw new Error("Düzeltme stok miktarını negatife düşürüyor.");
    const oldUnit =
      movement.HedefBirimID == null ? null : Number(movement.HedefBirimID);
    const nextUnit = input.hedefBirimId ? Number(input.hedefBirimId) : null;
    if (
      nextUnit &&
      !(
        await tx
          .request()
          .input("ID", nextUnit)
          .query(
            "SELECT ID FROM KysLaboratuvarBirim WHERE ID=@ID AND Durum='Aktif'",
          )
      ).recordset.length
    )
      throw new Error("Hedef birim bulunamadı.");
    if (nextUnit === oldUnit) await balance(tx, before.StokID, nextUnit, stockDelta);
    else {
      await balance(tx, before.StokID, oldUnit, -sign * Number(before.GelenMiktar));
      await balance(tx, before.StokID, nextUnit, sign * quantity);
    }
    await tx
      .request()
      .input("ID", before.StokID)
      .input("D", stockDelta)
      .query(
        "UPDATE KysStokKart SET StokMiktari=StokMiktari+@D,UpdatedAt=GETDATE() WHERE ID=@ID",
      );
    const supplier =
      purchasePermission &&
      input.tedarikciId &&
      Number(input.tedarikciId) !== Number(before.TedarikciID)
        ? await resolveKysSupplier(tx, input.tedarikciId)
        : null;
    const changes: Record<string, any> = {
      GelenMiktar: quantity,
      KabulTarihi: input.kabulTarihi || before.KabulTarihi,
      IstenilenMiktardaGeldi: input.istenilenMiktardaGeldi ? 1 : 0,
      MarkaOzellikUygun: input.markaOzellikUygun ? 1 : 0,
      SktUygun: input.sktUygun ? 1 : 0,
      SertifikaGerekli: input.sertifikaGerekli ? 1 : 0,
      GenelDegerlendirme: clean(input.genelDegerlendirme) || null,
      DegerlendirenID: input.degerlendirenId,
      DegerlendirenAd: input.degerlendirenAd,
    };
    if (purchasePermission) {
      const price = clean(input.birimFiyat) ? num(input.birimFiyat) : null;
      const total = clean(input.toplamTutar)
        ? num(input.toplamTutar)
        : price == null
          ? null
          : price * quantity;
      if ((price != null && price < 0) || (total != null && total < 0))
        throw new Error("Fiyat negatif olamaz.");
      Object.assign(changes, {
        TedarikciID: supplier?.id || before.TedarikciID || null,
        Tedarikci: supplier?.ad || before.Tedarikci || null,
        SatinAlmaTarihi: input.satinAlmaTarihi || null,
        BirimFiyat: price,
        ParaBirimi: clean(input.paraBirimi) || "TRY",
        ToplamTutar: total,
        FaturaNo: clean(input.faturaNo) || null,
      });
    } else if (delta && before.BirimFiyat != null)
      changes.ToplamTutar = Number(before.BirimFiyat) * quantity;
    const req = tx.request().input("ID", before.ID);
    Object.entries(changes).forEach(([k, v]) => req.input(k, v));
    await req.query(
      `UPDATE KysTalepKabul SET ${Object.keys(changes)
        .map((k) => `${k}=@${k}`)
        .join(",")} WHERE ID=@ID`,
    );
    await tx
      .request()
      .input("ID", movement.ID)
      .input("Q", quantity)
      .input("U", nextUnit)
      .input("B", stock.Birim)
      .input("M", clean(input.marka) || null)
      .input("L", clean(input.lot) || null)
      .input("SKT", input.skt || null)
      .input("Date", input.kabulTarihi || before.KabulTarihi)
      .query(
        "UPDATE KysStokHareket SET Miktar=@Q,HedefBirimID=@U,Birim=@B,Marka=@M,Lot=@L,SKT=@SKT,StokGirisTarihi=@Date WHERE ID=@ID",
      );
    await tx
      .request()
      .input("ID", item.ID)
      .input("Q", Number(item.KabulMiktari) + delta)
      .query(
        "UPDATE KysTalepKalem SET KabulMiktari=@Q,Durum=CASE WHEN @Q>=Miktar THEN 'Tamamlandı' ELSE 'Kısmi Kabul' END WHERE ID=@ID",
      );
    // Corrections may legitimately reopen a completed quantity, but never reset approval.
    await tx
      .request()
      .input("ID", talepId)
      .query(
        "UPDATE KysTalep SET Durum=CASE WHEN NOT EXISTS(SELECT 1 FROM KysTalepKalem WHERE TalepID=@ID AND Durum<>'Tamamlandı') THEN 'Tamamlandı' ELSE 'Kısmi Kabul' END,UpdatedAt=GETDATE() WHERE ID=@ID",
      );
    if (input.belge)
      await saveKysAcceptanceFile(
        tx,
        talepId,
        before.ID,
        input.belge,
        input.degerlendirenId,
      );
    await log(
      tx,
      talepId,
      before.ID,
      { kabul: before, hareket: movement },
      {
        kabul: { ...before, ...changes },
        hareket: { ...movement, Miktar: quantity, HedefBirimID: nextUnit },
        stokFarki: stockDelta,
      },
      input,
    );
    await tx.commit();
    return { ok: true, stokFarki: delta };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
