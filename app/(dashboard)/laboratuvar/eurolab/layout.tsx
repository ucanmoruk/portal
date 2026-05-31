import { loadEurolabAccess } from "@/lib/eurolabAccess";
import { EurolabAccessProvider } from "@/components/eurolab/EurolabAccessProvider";

export default async function EurolabSectionLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await loadEurolabAccess();
  return <EurolabAccessProvider value={snapshot}>{children}</EurolabAccessProvider>;
}
