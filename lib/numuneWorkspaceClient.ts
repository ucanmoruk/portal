"use client";

import { usePathname } from "next/navigation";
import { workspaceGroups } from "./numuneWorkspace";

const ROOT_PATH = "/laboratuvar/root-kozmetik";

export function useNumuneWorkspace() {
  const pathname = usePathname();
  const isRoot = pathname.startsWith(ROOT_PATH);
  return {
    isRoot,
    groups: workspaceGroups(isRoot ? "root" : "laboratuvar"),
    basePath: isRoot ? ROOT_PATH : "/laboratuvar",
  };
}

/** Keep the workspace on every API call, including exports and mutations. */
export function workspaceFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof window === "undefined") return fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return fetch(input, init);
  url.searchParams.set("workspace", window.location.pathname.startsWith(ROOT_PATH) ? "root" : "laboratuvar");
  return fetch(input instanceof Request ? new Request(url, input) : url, init);
}
