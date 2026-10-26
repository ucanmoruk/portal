"use client";
import { useNumuneWorkspace } from "@/lib/numuneWorkspaceClient";
import UrunFormClient from "@/app/(dashboard)/ugd/urun-listesi/_components/UrunFormClient";

type LaboratuvarUgdrFormPageProps = {
  nkrId: string;
  displayLabel?: string;
};

export default function LaboratuvarUgdrFormPage({ nkrId, displayLabel }: LaboratuvarUgdrFormPageProps) {
  const { basePath } = useNumuneWorkspace();
  return (
    <UrunFormClient
      editId={nkrId}
      displayLabel={displayLabel}
      source="lab"
      returnHref={`${basePath}/rapor-takip`}
    />
  );
}
