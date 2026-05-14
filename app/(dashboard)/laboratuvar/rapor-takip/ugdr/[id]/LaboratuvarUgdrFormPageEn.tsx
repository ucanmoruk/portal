import UrunFormClientEn from "@/app/(dashboard)/ugd/urun-listesi/_components/UrunFormClientEn";

type LaboratuvarUgdrFormPageProps = {
  nkrId: string;
};

export default function LaboratuvarUgdrFormPage({ nkrId }: LaboratuvarUgdrFormPageProps) {
  return (
    <UrunFormClientEn
      editId={nkrId}
      source="lab"
      returnHref="/laboratuvar/rapor-takip"
    />
  );
}
