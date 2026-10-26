"use client";

import { useNumuneWorkspace } from "@/lib/numuneWorkspaceClient";

export default function NumuneWorkspaceNotice() {
  const { isRoot } = useNumuneWorkspace();
  return (
    <p style={{ color: "var(--color-text-secondary)", fontSize: "0.82rem", margin: "0 0 12px" }}>
      {isRoot ? "Root Kozmetik · K.D. ve Belge grupları" : "Laboratuvar · Özel grubu"}
    </p>
  );
}
