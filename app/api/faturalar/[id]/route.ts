import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { ODEME_DURUMLARI } from "@/lib/faturaConstants";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

function toNumber(value: any, fallback = 0) {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function hasOwn(body: any, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

async function ensureProformaNkrTable(pool: any) {
  if (hasMysqlConfig()) {
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS ProformaNkr (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        ProformaID INT NOT NULL,
        NkrID INT NOT NULL,
        EvrakNo VARCHAR(40) NULL,
        RaporNo VARCHAR(60) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY UX_ProformaNkr_Proforma_Nkr (ProformaID, NkrID),
        KEY IX_ProformaNkr_EvrakNo (EvrakNo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    return;
  }

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ProformaNkr' AND xtype='U')
    CREATE TABLE ProformaNkr (
      ID          INT IDENTITY(1,1) PRIMARY KEY,
      ProformaID  INT          NOT NULL,
      NkrID       INT          NOT NULL,
      EvrakNo     NVARCHAR(40) NULL,
      RaporNo     NVARCHAR(60) NULL,
      CreatedAt   DATETIME     NOT NULL DEFAULT GETDATE()
    )
  `);
}

// Ödeme durumu güncelle — Odeme tablosuna yeni aşama satırı ekler (append-only;
// güncel durum = en son ID'li satır). Böylece numune-takip "Ödeme" sütunu ve
// fatura-takip aynı kaynaktan tutarlı kalır.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const body = await request.json();
    const hasOdemeDurumu = body.odemeDurumu != null && String(body.odemeDurumu).trim() !== "";
    const odemeDurumu = hasOdemeDurumu ? String(body.odemeDurumu).trim() : "";
    const hasEvrakNo = hasOwn(body, "evrakNo");
    const requestedEvrakNo = hasEvrakNo ? String(body.evrakNo ?? "").trim() : "";
    const hasFaturaFields = ["faturaNo", "faturaTarihi", "toplam", "kdvOran", "faturaFirmaId", "aciklama"]
      .some((key) => hasOwn(body, key));

    if (hasOdemeDurumu && !ODEME_DURUMLARI.includes(odemeDurumu)) {
      return Response.json({ error: "Geçersiz ödeme durumu" }, { status: 400 });
    }
    if (!hasOdemeDurumu && !hasEvrakNo && !hasFaturaFields) {
      return Response.json({ error: "Güncellenecek alan bulunamadı." }, { status: 400 });
    }

    const pool = await cosmoPool;
    await ensureProformaNkrTable(pool);
    const fatRes = await pool.request()
      .input("id", Number(id))
      .query(`SELECT ID, ProformaNo, Toplam, KDV FROM Fatura WHERE ID = @id AND Durum = 'Aktif'`);
    const fatura = fatRes.recordset[0];
    if (!fatura) return Response.json({ error: "Fatura bulunamadı." }, { status: 404 });

    let evrakNo = fatura.ProformaNo ? String(fatura.ProformaNo).trim() : "";
    if (hasFaturaFields) {
      const setParts: string[] = [];
      const updateReq = pool.request().input("id", Number(id));

      if (hasOwn(body, "faturaNo")) {
        const faturaNo = String(body.faturaNo || "").trim();
        if (!faturaNo) return Response.json({ error: "Fatura no zorunludur." }, { status: 400 });
        updateReq.input("FaturaNo", faturaNo);
        setParts.push("Fatura_No = @FaturaNo");
      }
      if (hasOwn(body, "faturaTarihi")) {
        const faturaTarihi = String(body.faturaTarihi || "").trim();
        if (!faturaTarihi) return Response.json({ error: "Fatura tarihi zorunludur." }, { status: 400 });
        updateReq.input("Tarih", faturaTarihi);
        setParts.push("Tarih = @Tarih");
      }
      if (hasOwn(body, "faturaFirmaId")) {
        const firmaId = body.faturaFirmaId ? Number(body.faturaFirmaId) : null;
        updateReq.input("FaturaFirmaID", firmaId);
        setParts.push("FaturaFirmaID = @FaturaFirmaID");
      }
      if (hasOwn(body, "aciklama")) {
        const aciklama = String(body.aciklama ?? "").trim() || null;
        updateReq.input("Aciklama", aciklama);
        setParts.push("Aciklama = @Aciklama");
      }
      if (hasOwn(body, "toplam") || hasOwn(body, "kdvOran")) {
        const toplam = hasOwn(body, "toplam") ? toNumber(body.toplam) : Number(fatura.Toplam || 0);
        const existingNet = Math.max(Number(fatura.Toplam || 0) - Number(fatura.KDV || 0), 0);
        const existingRate = existingNet > 0 ? (Number(fatura.KDV || 0) / existingNet) * 100 : 20;
        const kdvOran = hasOwn(body, "kdvOran") ? toNumber(body.kdvOran, 20) : existingRate;
        const net = toplam / (1 + kdvOran / 100);
        const kdv = toplam - net;
        updateReq
          .input("Toplam", Number(toplam.toFixed(2)))
          .input("Tutar", Number(net.toFixed(2)))
          .input("KDV", Number(kdv.toFixed(2)));
        setParts.push("Toplam = @Toplam", "Tutar = @Tutar", "KDV = @KDV");
      }

      if (setParts.length > 0) {
        await updateReq.query(`UPDATE Fatura SET ${setParts.join(", ")} WHERE ID = @id`);
      }
    }

    if (hasEvrakNo) {
      evrakNo = requestedEvrakNo;
      await pool.request()
        .input("id", Number(id))
        .input("ProformaNo", evrakNo || null)
        .query(`UPDATE Fatura SET ProformaNo = @ProformaNo WHERE ID = @id`);
    }

    const targetEvrakNos = new Set<string>();
    if (evrakNo) targetEvrakNos.add(evrakNo);

    const existingTargets = await pool.request()
      .input("Fatura_ID", Number(id))
      .query(`
        SELECT DISTINCT Evrak_No AS EvrakNo
        FROM Odeme
        WHERE Fatura_ID = @Fatura_ID
          AND Evrak_No IS NOT NULL
      `);
    for (const row of existingTargets.recordset || []) {
      const target = String(row.EvrakNo || "").trim();
      if (target) targetEvrakNos.add(target);
    }

    const proformaRes = await pool.request()
      .input("ProformaNo", evrakNo)
      .query(`
        SELECT TOP 1 ID
        FROM ProformaBaslik
        WHERE SilindiMi = 0
          AND (EvrakNo = @ProformaNo OR ProformaNo = @ProformaNo)
        ORDER BY ID DESC
      `);
    const proformaId = Number(proformaRes.recordset?.[0]?.ID || 0);
    if (proformaId) {
      const linkedTargets = await pool.request()
        .input("ProformaID", proformaId)
        .query(`
          SELECT DISTINCT EvrakNo
          FROM ProformaNkr
          WHERE ProformaID = @ProformaID
            AND EvrakNo IS NOT NULL
            AND EvrakNo <> ''
        `);
      for (const row of linkedTargets.recordset || []) {
        const target = String(row.EvrakNo || "").trim();
        if (target) targetEvrakNos.add(target);
      }
    }

    const shouldInsertOdeme = hasOdemeDurumu || hasEvrakNo;
    if (!shouldInsertOdeme) {
      return Response.json({ success: true, evrakNo: evrakNo || null });
    }

    const statusForLink = hasOdemeDurumu
      ? odemeDurumu
      : (await pool.request()
          .input("Fatura_ID", Number(id))
          .query(`
            SELECT TOP 1 Odeme_Durumu
            FROM Odeme
            WHERE Fatura_ID = @Fatura_ID
              AND ISNULL(Odeme_Durumu, N'') <> N'Proforma'
            ORDER BY ID DESC
          `)).recordset?.[0]?.Odeme_Durumu || "Ödeme Bekliyor";

    // Ödeme aşaması Odeme tablosuna (numune-takip + fatura-takip ortak kaynak).
    const insertTargets = targetEvrakNos.size > 0 ? Array.from(targetEvrakNos) : [null];
    for (const targetEvrakNo of insertTargets) {
      await pool.request()
        .input("Evrak_No", targetEvrakNo)
        .input("Odeme_Durumu", statusForLink)
        .input("Fatura_ID", Number(id))
        .query(`
          INSERT INTO Odeme (Evrak_No, Odeme_Durumu, Fatura_ID, Tarih)
          VALUES (@Evrak_No, @Odeme_Durumu, @Fatura_ID, GETDATE())
        `);
    }

    // Footer "Ödenen" toplamı Fatura.Odenen_Tutar'dan hesaplandığı için netleşen
    // durumlarda tutarı senkronla (Kısmen/İptal → tutar bilinmediğinden dokunma).
    if (statusForLink === "Ödendi") {
      await pool.request().input("id", Number(id))
        .query(`UPDATE Fatura SET Odenen_Tutar = Toplam WHERE ID = @id`);
    } else if (statusForLink === "Ödeme Bekliyor") {
      await pool.request().input("id", Number(id))
        .query(`UPDATE Fatura SET Odenen_Tutar = 0 WHERE ID = @id`);
    }

    return Response.json({ success: true, evrakNo: evrakNo || null, odemeDurumu: statusForLink });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
