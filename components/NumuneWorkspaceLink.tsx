"use client";

import Link from "next/link";
import { useNumuneWorkspace } from "@/lib/numuneWorkspaceClient";

export default function NumuneWorkspaceLink({ href, ...props }: React.ComponentProps<typeof Link>) {
  const { basePath } = useNumuneWorkspace();
  const scopedHref = typeof href === "string" && href.startsWith("/laboratuvar/")
    ? href.replace("/laboratuvar", basePath)
    : href;
  return <Link {...props} href={scopedHref} />;
}
