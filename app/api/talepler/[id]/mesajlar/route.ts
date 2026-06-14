import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool, rootPool } from "@/lib/db";

// RootKullanici kolon adlari dinamik (KullaniciAdi/Kadi, AdSoyad/Adi vb.).
// Tek seferlik kesfedip cache et — process omru boyunca gecerli.
let _rootKullaniciSelect: { idCol: string; nameExpr: string } | null = null;

async function detectRootKullaniciCols(pool: any) {
  if (_rootKullaniciSelect) return _rootKullaniciSelect;
  const r = await pool.request().query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RootKullanici'`
  );
  const cols = new Set(r.recordset.map((row: any) => row.COLUMN_NAME as string));
  const idCol = ["ID", "Id", "id", "KullaniciId"].find(c => cols.has(c)) || "ID";
  const nameCol = ["AdSoyad", "FullName", "Name", "Adi"].find(c => cols.has(c));
  const firstNameCol = ["Ad", "FirstName", "Firstname"].find(c => cols.has(c));
  const lastNameCol  = ["Soyad", "LastName", "Lastname"].find(c => cols.has(c));
  const usernameCol  = ["KullaniciAdi", "Kadi", "UserName", "Username", "Login", "kadi"].find(c => cols.has(c));
  let nameExpr: string;
  if (nameCol) nameExpr = `ISNULL(${nameCol}, '')`;
  else if (firstNameCol && lastNameCol) nameExpr = `LTRIM(RTRIM(ISNULL(${firstNameCol}, '') + ' ' + ISNULL(${lastNameCol}, '')))`;
  else if (firstNameCol) nameExpr = `ISNULL(${firstNameCol}, '')`;
  else if (usernameCol) nameExpr = `ISNULL(${usernameCol}, '')`;
  else nameExpr = "''";
  _rootKullaniciSelect = { idCol, nameExpr };
  return _rootKullaniciSelect;
}

async function lookupPersonelAdlari(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (!ids.length) return map;
  try {
    const pool = await rootPool;
    const { idCol, nameExpr } = await detectRootKullaniciCols(pool);
    // Parametrize: id1, id2, ... olarak bind et
    const req = pool.request();
    const placeholders: string[] = [];
    ids.forEach((id, i) => {
      const name = `id${i}`;
      req.input(name, id);
      placeholders.push(`@${name}`);
    });
    const r = await req.query(
      `SELECT ${idCol} AS ID, ${nameExpr} AS Ad FROM RootKullanici WHERE ${idCol} IN (${placeholders.join(",")})`
    );
    for (const row of r.recordset) {
      const ad = String(row.Ad ?? "").trim();
      if (ad) map.set(Number(row.ID), ad);
    }
  } catch {
    // Lookup başarısız olursa boş map dön — UI "Personel" fallback gösterir
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/talepler/[id]/mesajlar  — talebin konuşma akışını döner
// POST /api/talepler/[id]/mesajlar  — yeni personel mesajı ekler
//
// Müşteri portalı destek talebini şuraya yazıyor:
//   cosmoroot.DESTEK         — ilk mesaj (BASLIK + ACIKLAMA)
//   cosmoroot.DESTEK_DETAY   — sonraki mesajlar
// Personel cevabı da DESTEK_DETAY'a yazılır → müşteri portalı görür.
//
// GonderenTip ayrımı: DESTEK_DETAY.KAYIT_EDEN === DESTEK.KAYIT_EDEN ise "Musteri",
// değilse "Personel".
// ─────────────────────────────────────────────────────────────────────────────

interface RouteCtx { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  const nid = Number(id);
  if (!Number.isFinite(nid)) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const pool = await cosmoPool;

    // 1) DESTEK ana kaydı (başlık + ilk mesaj)
    const destekRes = await pool.request().input("tid", nid).query(`
      SELECT TOP 1
        ID, DESTEK_NO, TUR, KONU_TUR, BASLIK, ACIKLAMA, KAYIT_TARIHI, KAYIT_EDEN, DOSYA
      FROM cosmoroot.DESTEK
      WHERE TalepID = @tid
    `);
    const destek = destekRes.recordset[0];

    // 2) DESTEK_DETAY (sonraki mesajlar)
    const detayRes = await pool.request().input("tid", nid).query(`
      SELECT DETAY_ID, DESTEK_REF, MESAJ, MESAJ_TARIHI, KAYIT_EDEN, DETAY_DOSYA
      FROM cosmoroot.DESTEK_DETAY
      WHERE DESTEK_REF = @tid
      ORDER BY MESAJ_TARIHI ASC, DETAY_ID ASC
    `);

    // 3) Bizim eklediğimiz dbo.TalepMesaj (varsa — şimdilik kullanmıyoruz ama geriye uyum için dahil)
    let kendiMesajlar: any[] = [];
    try {
      const kendiRes = await pool.request().input("tid", nid).query(`
        SELECT ID, GonderenTip, GonderenID, ISNULL(GonderenAd, '') AS GonderenAd, Mesaj, Tarih
        FROM dbo.TalepMesaj
        WHERE TalepID = @tid
      `);
      kendiMesajlar = kendiRes.recordset;
    } catch {} // tablo yoksa sessiz geç

    // Mesaj listesini birleştir
    const customerId = destek?.KAYIT_EDEN ?? null;
    const aciklamaTrim = String(destek?.ACIKLAMA ?? "").trim();
    const mesajlar: any[] = [];

    // İlk mesaj: DESTEK.ACIKLAMA (müşteri tarafından oluşturuldu)
    if (destek && aciklamaTrim.length > 0) {
      mesajlar.push({
        ID: `D-${destek.ID}`,
        kaynak: "DESTEK",
        GonderenTip: "Musteri",
        GonderenID: destek.KAYIT_EDEN,
        GonderenAd: "Müşteri",
        Mesaj: destek.ACIKLAMA,
        Tarih: destek.KAYIT_TARIHI, // string "YYYY-MM-DD HH:mm:ss"
      });
    }

    // İlk DESTEK_DETAY kaydı, DESTEK.ACIKLAMA'nın kopyası olabilir (müşteri portal
    // talep oluştururken aynı metni iki tabloya da yazıyor). Aynı kullanıcı + metin
    // ACIKLAMA içinde geçiyorsa atla.
    const detayItems = [...detayRes.recordset];
    if (detayItems.length > 0 && aciklamaTrim) {
      const first = detayItems[0];
      const firstMsg = String(first.MESAJ ?? "").trim();
      if (
        firstMsg &&
        first.KAYIT_EDEN === customerId &&
        aciklamaTrim.includes(firstMsg)
      ) {
        detayItems.shift();
      }
    }

    // Personel KAYIT_EDEN ID'lerini topla → RootKullanici'den ad lookup
    const personelIds: number[] = [];
    for (const m of detayItems) {
      const isMusteri = customerId !== null && m.KAYIT_EDEN === customerId;
      if (!isMusteri && Number.isFinite(Number(m.KAYIT_EDEN))) {
        personelIds.push(Number(m.KAYIT_EDEN));
      }
    }
    const adMap = await lookupPersonelAdlari([...new Set(personelIds)]);

    // DESTEK_DETAY mesajları (KAYIT_EDEN'e göre Müşteri/Personel ayrımı)
    for (const m of detayItems) {
      const isMusteri = customerId !== null && m.KAYIT_EDEN === customerId;
      const gonderenAd = isMusteri
        ? "Müşteri"
        : (adMap.get(Number(m.KAYIT_EDEN)) || "Personel");
      mesajlar.push({
        ID: `DD-${m.DETAY_ID}`,
        kaynak: "DESTEK_DETAY",
        GonderenTip: isMusteri ? "Musteri" : "Personel",
        GonderenID: m.KAYIT_EDEN,
        GonderenAd: gonderenAd,
        Mesaj: m.MESAJ,
        Tarih: m.MESAJ_TARIHI,
      });
    }

    // dbo.TalepMesaj — varsa ekle
    for (const m of kendiMesajlar) {
      mesajlar.push({
        ID: `TM-${m.ID}`,
        kaynak: "TalepMesaj",
        GonderenTip: m.GonderenTip,
        GonderenID: m.GonderenID,
        GonderenAd: m.GonderenAd || (m.GonderenTip === "Musteri" ? "Müşteri" : "Personel"),
        Mesaj: m.Mesaj,
        Tarih: m.Tarih,
      });
    }

    // Tarihe göre sırala (string ISO uyumlu format → sözlüksel sıra zaten kronolojik)
    mesajlar.sort((a, b) => {
      const ta = typeof a.Tarih === "string" ? a.Tarih : new Date(a.Tarih).toISOString();
      const tb = typeof b.Tarih === "string" ? b.Tarih : new Date(b.Tarih).toISOString();
      return ta.localeCompare(tb);
    });

    return Response.json({
      header: destek ? {
        destekNo: destek.DESTEK_NO,
        baslik:   destek.BASLIK,
        tur:      destek.TUR,
        dosya:    destek.DOSYA,
      } : null,
      data: mesajlar,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  const nid = Number(id);
  if (!Number.isFinite(nid)) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  let body: any;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Geçersiz JSON" }, { status: 400 }); }

  const mesaj = String(body?.mesaj || "").trim();
  if (!mesaj) return Response.json({ error: "Mesaj boş olamaz." }, { status: 400 });

  const userId = (session.user as any)?.userId ?? null;

  try {
    const pool = await cosmoPool;

    // Talep var mı?
    const tCheck = await pool.request().input("id", nid).query(
      `SELECT TOP 1 ID FROM dbo.Talep WHERE ID = @id`
    );
    if (!tCheck.recordset.length) {
      return Response.json({ error: "Talep bulunamadı." }, { status: 404 });
    }

    // Personel cevabı: cosmoroot.DESTEK_DETAY'a yaz → müşteri portalı görür.
    // MESAJ_TARIHI cosmoroot.DESTEK_DETAY'da varchar(50). Müşteri portal'ın
    // kullandığı format: "YYYY-MM-DD HH:mm:ss".
    const insRes = await pool.request()
      .input("ref",      nid)
      .input("mesaj",    mesaj)
      .input("kayitEden", userId ? Number(userId) : 0)
      .query(`
        INSERT INTO cosmoroot.DESTEK_DETAY (DESTEK_REF, MESAJ, MESAJ_TARIHI, KAYIT_EDEN)
        OUTPUT INSERTED.DETAY_ID
        VALUES (@ref, @mesaj, CONVERT(VARCHAR(19), GETDATE(), 120), @kayitEden)
      `);

    // Personel cevabı sonrası durum otomatik "Cevaplandı" (Yeni Talep / Müşteri
    // Yanıtı durumundayken). Kapandı veya zaten Cevaplandı durumda dokunma.
    await pool.request().input("id", nid).query(`
      UPDATE dbo.Talep
      SET Durum = N'Cevaplandı'
      WHERE ID = @id AND Tur = N'Destek'
        AND ISNULL(Durum, '') IN (N'Yeni Talep', N'Müşteri Yanıtı')
    `);

    return Response.json({
      id: insRes.recordset[0].DETAY_ID,
    }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
