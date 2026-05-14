import UrunFormClient from "@/app/(dashboard)/ugd/urun-listesi/_components/UrunFormClient";

type LaboratuvarUgdrFormPageProps = {
  nkrId: string;
};

export default function LaboratuvarUgdrFormPage({ nkrId }: LaboratuvarUgdrFormPageProps) {
  return (
    <UrunFormClient
      editId={nkrId}
      source="lab"
      returnHref="/laboratuvar/rapor-takip"
    />
  );
}
