import { cosmoPool } from "@/lib/db";
import type { CrmPackage, CrmService } from "@/lib/crmOffer";

export async function getCrmCatalog() {
  const pool = await cosmoPool;
  const [services, packages, members] = await Promise.all([
    pool.request().query("SELECT ID,Kod,Ad,Fiyat,ParaBirimi,ISNULL(Method,Metot) AS Metot,Akreditasyon,Matriks,Sure,NumGereklilik,NumDipnot FROM StokAnalizListesi WHERE Durumu='Aktif' ORDER BY Ad"),
    pool.request().query("SELECT ID,Aciklama AS Ad FROM NumuneX3 WHERE Durum='Aktif' ORDER BY Aciklama"),
    pool.request().query("SELECT x.x3ID AS PaketID,x.AltAnalizID AS HizmetID FROM NumuneX4 x INNER JOIN NumuneX3 p ON p.ID=x.x3ID WHERE p.Durum='Aktif' ORDER BY x.ID"),
  ]);
  return { services: services.recordset as CrmService[], packages: packages.recordset.map((pack: { ID: number; Ad: string }) => ({ ...pack, ID: Number(pack.ID), serviceIds: members.recordset.filter((member: { PaketID: number }) => Number(member.PaketID) === Number(pack.ID)).map((member: { HizmetID: number }) => Number(member.HizmetID)) })) as CrmPackage[] };
}
