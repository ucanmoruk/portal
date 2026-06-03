import UrunFormClient from "@/app/(dashboard)/ugd/urun-listesi/_components/UrunFormClient";

type LaboratuvarUgdrFormPageProps = {
  nkrId: string;
  displayLabel?: string;
};

export default function LaboratuvarUgdrFormPage({ nkrId, displayLabel }: LaboratuvarUgdrFormPageProps) {
  return (
    <UrunFormClient
      editId={nkrId}
      displayLabel={displayLabel}
      source="lab"
      returnHref="/laboratuvar/rapor-takip"
    />
  );
}
