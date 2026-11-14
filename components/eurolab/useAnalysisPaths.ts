"use client";
import { usePathname } from "next/navigation";
export function useAnalysisPaths() {
  const kys = usePathname().startsWith("/laboratuvar/kys/");
  return { brand: kys ? "Unique" : "Eurolab", methods: kys ? "/laboratuvar/kys/analiz-listesi" : "/laboratuvar/eurolab/metotlar", validations: kys ? "/laboratuvar/kys/validasyon" : "/laboratuvar/eurolab/validasyon", qc: kys ? "/laboratuvar/kys/qc-kartlar" : "/laboratuvar/eurolab/qc-kartlar" };
}
