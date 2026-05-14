import UrunFormClientEn from "../../../_components/UrunFormClientEn";

export default async function DuzenleUrunEnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UrunFormClientEn editId={id} />;
}

