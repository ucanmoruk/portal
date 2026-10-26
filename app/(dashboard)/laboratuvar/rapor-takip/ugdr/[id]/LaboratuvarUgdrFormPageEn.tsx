"use client";
import { useNumuneWorkspace } from "@/lib/numuneWorkspaceClient";
import UrunFormClientEn from "@/app/(dashboard)/ugd/urun-listesi/_components/UrunFormClientEn";

type LaboratuvarUgdrFormPageProps = {
  nkrId: string;
  displayLabel?: string;
};

export default function LaboratuvarUgdrFormPage({ nkrId, displayLabel }: LaboratuvarUgdrFormPageProps) {
  const { basePath } = useNumuneWorkspace();
  return (
    <UrunFormClientEn
      editId={nkrId}
      displayLabel={displayLabel}
      source="lab"
      returnHref={`${basePath}/rapor-takip`}
    />
  );
}
