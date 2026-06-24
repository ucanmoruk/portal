import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cosmoPool } from "@/lib/db";
import ProformaPrintDocument, {
  type ProformaHeader,
  type ProformaSatir,
  type BankaBilgi,
} from "./ProformaPrintDocument";
import PrintToolbar from "../../teklif-print/[id]/PrintToolbar";
import { calculateTlEquivalent, fetchTcmbTodayRates, normalizeParaBirimi } from "@/lib/tcmbRates";

export const metadata = { title: "Proforma Fatura" };

function fmtMoney(value: unknown) {
  const n = Number(value || 0);
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Banka/IBAN bilgileri — env ile override edilebilir, aksi halde varsayılan.
// Müşteri portalına kopyalandığında bu listeyi consumer kendisi verebilir.
function loadBankaBilgileri(): BankaBilgi[] {
  const raw = process.env.PROFORMA_BANKA_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as BankaBilgi[];
    } catch (e) {
      console.warn("proforma: PROFORMA_BANKA_JSON parse hatası:", e);
    }
  }
  return [];
}

export default async function ProformaPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ print?: string; pdfMode?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const autoPrint = sp.print === "1";
  const pdfMode = sp.pdfMode === "1";
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Geçersiz proforma.</div>;
  }

  const pool = await cosmoPool;
  const headerRes = await pool.request()
    .input("id", idNum)
    .query(`
      SELECT p.*, FORMAT(p.Tarih, 'dd.MM.yyyy') AS TarihText,
             ISNULL(f.Ad, '') AS MusteriAd,
             ISNULL(f.Adres, '') AS MusteriAdres,
             ISNULL(f.Telefon, '') AS MusteriTelefon,
             ISNULL(f.Email, '') AS MusteriEmail,
             ISNULL(f.VergiDairesi, '') AS VergiDairesi,
             ISNULL(f.VergiNo, '') AS VergiNo,
             ISNULL(f.Yetkili, '') AS MusteriYetkili
      FROM ProformaBaslik p
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f ON f.ID = p.FirmaID
      WHERE p.ID = @id AND p.SilindiMi = 0
    `);

  if (!headerRes.recordset.length) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Proforma bulunamadı.</div>;
  }
  const h = headerRes.recordset[0];

  const satirRes = await pool.request()
    .input("id", idNum)
    .query(`
      SELECT HizmetAdi, Adet, BirimFiyat AS Fiyat, ParaBirimi, Iskonto,
             RaporNoListesi AS Notlar
      FROM ProformaKalem
      WHERE ProformaID = @id
      ORDER BY ID
    `);
  const satirlar = satirRes.recordset as ProformaSatir[];

  // ── Para birimi + TL karşılığı (TCMB döviz alış) ──
  const currencies = Array.from(new Set(satirlar.map((s) => normalizeParaBirimi(s.ParaBirimi || "TRY"))));
  const paraBirimi = currencies.length > 1 ? "ÇOKLU" : (currencies[0] || "TRY");
  let tlEquivalentNote: string | null = null;
  if (!["TRY", "TL", "₺", "ÇOKLU"].includes(paraBirimi)) {
    try {
      const rates = await fetchTcmbTodayRates();
      const rate = rates[paraBirimi]?.forexBuying;
      const tl = calculateTlEquivalent(h.GenelToplam, paraBirimi, rates);
      if (rate && tl != null) {
        tlEquivalentNote = `${fmtMoney(tl)} TL (TCMB döviz alış: 1 ${paraBirimi} = ${fmtMoney(rate)} TL)`;
      }
    } catch (e) {
      console.warn("proforma print: TCMB kuru alınamadı:", e);
    }
  }

  const header: ProformaHeader = {
    ProformaNo: h.ProformaNo || null,
    Tarih: h.TarihText || "",
    Notlar: h.Notlar || null,
    KdvOran: h.KdvOran ?? 20,
    GenelIskonto: h.GenelIskonto ?? 0,
    MusteriAd: h.MusteriAd || "",
    MusteriAdres: h.MusteriAdres || "",
    MusteriTelefon: h.MusteriTelefon || "",
    MusteriEmail: h.MusteriEmail || "",
    VergiDairesi: h.VergiDairesi || "",
    VergiNo: h.VergiNo || "",
    MusteriYetkili: h.MusteriYetkili || "",
  };

  const sirketAdi = process.env.SIRKET_ADI || "UNIQUE ANALYSE";
  const sirketEmail = process.env.SIRKET_EMAIL || "info@uniqueanalyse.com";
  const bankaBilgileri = loadBankaBilgileri();

  return (
    <ProformaPrintDocument
      header={header}
      satirlar={satirlar}
      sirketAdi={sirketAdi}
      sirketEmail={sirketEmail}
      bankaBilgileri={bankaBilgileri}
      tlEquivalentNote={tlEquivalentNote}
      toolbar={!pdfMode ? (
        <PrintToolbar
          pdfUrl={`/api/proforma-print/${encodeURIComponent(id)}/pdf?download=1`}
          autoPrint={autoPrint}
        />
      ) : undefined}
    />
  );
}
