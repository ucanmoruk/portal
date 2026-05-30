// Geriye dönük uyumluluk: eski /rapor-dogrula/[token] yolu artık
// kanonik /rapordogrulama/[id] sayfasına yönlendirilir.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function RaporDogrulaRedirect({ params }: PageProps) {
  const { token } = await params;
  redirect(`/rapordogrulama/${encodeURIComponent(token)}`);
}
