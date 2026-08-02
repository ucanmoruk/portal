import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getKysStockDetail } from "@/lib/kysStore";
import kys from "../../kys.module.css";
import PrintButton from "./PrintButton";
import BarcodeSvg from "./BarcodeSvg";

export const metadata = { title: "KYS - Stok Kartı Yazdır" };

export default async function StokKartiYazdirPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { id } = await params;
  const detail = await getKysStockDetail(Number(id));
  if (!detail) redirect("/laboratuvar/kys/stok-listesi");
  const s = detail.stock;

  return (
    <div className={kys.printPage}>
      <div className={kys.noPrint} style={{ marginBottom: 16 }}>
        <PrintButton />
      </div>
      <div className={kys.printCard}>
        <h1 style={{ fontSize: 22, margin: 0 }}>UNIQUE ANALYSE</h1>
        <div style={{ fontSize: 13, marginTop: 4 }}>KYS Stok Kartı</div>
        <div className={kys.barcodeBox}><BarcodeSvg value={s.barkod || s.kod} /></div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {[
              ["Kod", s.kod],
              ["Ad", s.ad],
              ["Name", s.name],
              ["Tür", s.malzemeTuru],
              ["CAS No", s.casNo],
              ["Ambalaj", s.ambalaj],
              ["Saklama", s.saklamaKosullari],
              ["Kritik Limit", `${s.kritikLimit} ${s.birim}`],
              ["Stok Miktarı", `${s.stokMiktari} ${s.birim}`],
            ].map(([label, value]) => (
              <tr key={label}>
                <td style={{ borderTop: "1px solid #ddd", padding: "6px 4px", fontWeight: 700, width: "34%" }}>{label}</td>
                <td style={{ borderTop: "1px solid #ddd", padding: "6px 4px" }}>{value || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
