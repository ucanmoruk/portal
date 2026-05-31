import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { ComponentType } from "react";
import GenelReport from "./formats/GenelReport";
import ChallengeReport from "./formats/ChallengeReport";
import type { ReportFormatProps } from "./reportTypes";
import { loadRaporViewData } from "@/lib/raporViewData";

export const metadata = { title: "Analiz Raporu — Onay Önizleme" };

// Rapor türüne göre format bileşeni. Yeni format eklemek için formats/ altında
// bir bileşen oluşturup buraya kaydetmek yeterli.
const FORMAT_COMPONENTS: Record<string, ComponentType<ReportFormatProps>> = {
  Genel: GenelReport,
  Challenge: ChallengeReport,
};

function resolveFormatComponent(format: string): ComponentType<ReportFormatProps> {
  return FORMAT_COMPONENTS[format] ?? GenelReport;
}

export default async function RaporOnayPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ nkrId: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { nkrId } = await params;
  const sp = await searchParams;
  const format = (sp.format || "").trim();
  const nkrIdNum = parseInt(nkrId, 10);

  if (!Number.isFinite(nkrIdNum) || !format) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Geçersiz rapor / format.</div>;
  }

  // ÖNEMLI: Önizleme ve imzalı PDF AYNI veri yükleyiciyi kullanır →
  // ekranda görünen ile imzalanan/doğrulanan içerik HER ZAMAN birebir aynı.
  const data = await loadRaporViewData(nkrIdNum, format);
  if (!data) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Rapor bulunamadı.</div>;
  }

  const ReportComponent = resolveFormatComponent(format);

  return (
    <ReportComponent
      nkrId={nkrIdNum}
      format={format}
      header={data.header}
      hizmetler={data.hizmetler}
      testBaslangic={data.testBaslangic}
      testBitis={data.testBitis}
      onay={data.onay}
      meta={data.meta}
      karekod={data.karekod}
    />
  );
}
