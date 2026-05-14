import LaboratuvarUgdrFormPage from "./LaboratuvarUgdrFormPage";

export default async function LaboratuvarUgdrDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LaboratuvarUgdrFormPage nkrId={id} />;
}
