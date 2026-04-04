import NumuneFormClient from "../NumuneFormClient";

export const metadata = { title: "Numune Düzenle" };

export default async function NumuneFormEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NumuneFormClient recordId={id} />;
}
