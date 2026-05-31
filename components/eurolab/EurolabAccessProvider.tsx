"use client";

import { createContext, useContext, type ReactNode } from "react";

export type AccessLevel = "edit" | "view";

export interface EurolabAccessValue {
  isAdmin: boolean;
  levels: Record<string, AccessLevel>;
}

const EurolabAccessContext = createContext<EurolabAccessValue>({ isAdmin: true, levels: {} });

export function EurolabAccessProvider({
  value,
  children,
}: {
  value: EurolabAccessValue;
  children: ReactNode;
}) {
  return <EurolabAccessContext.Provider value={value}>{children}</EurolabAccessContext.Provider>;
}

/**
 * Belirtilen Eurolab menü key'i için kullanıcının düzenleme yetkisi var mı?
 * Admin → her zaman true.
 * Kayıtlı seviye 'view' → false. 'edit' → true.
 * Hiç kayıt yoksa (genelde admin değil + bilinmeyen sayfa): false (güvenli taraf).
 */
export function useCanEdit(menuKey: string): boolean {
  const { isAdmin, levels } = useContext(EurolabAccessContext);
  if (isAdmin) return true;
  if (menuKey in levels) return levels[menuKey] === "edit";
  if ("eurolab" in levels) return levels.eurolab === "edit";
  return false;
}

export function useEurolabAccess(): EurolabAccessValue {
  return useContext(EurolabAccessContext);
}
