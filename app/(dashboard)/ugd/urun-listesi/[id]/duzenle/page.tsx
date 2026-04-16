import UrunFormClient from '../../_components/UrunFormClient';

export default async function DuzenleUrunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UrunFormClient editId={id} />;
}
