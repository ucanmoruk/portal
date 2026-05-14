import LaboratuvarUgdrFormPageEn from "../LaboratuvarUgdrFormPageEn";

export default async function LaboratuvarUgdrDetayEnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LaboratuvarUgdrFormPageEn nkrId={id} />;
}

