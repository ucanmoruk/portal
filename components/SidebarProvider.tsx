"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface SidebarCtx {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarCtx>({
  isOpen: false,
  toggle: () => {},
  close: () => {},
  isCollapsed: false,
  toggleCollapsed: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  useEffect(() => {
    const collapsed = localStorage.getItem("portal-sidebar-collapsed") === "true";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsCollapsed(collapsed);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", isCollapsed ? "64px" : "240px");
    return () => { document.documentElement.style.removeProperty("--sidebar-width"); };
  }, [isCollapsed]);
  return (
    <SidebarContext.Provider value={{
      isOpen,
      toggle: () => setIsOpen(p => !p),
      close: () => setIsOpen(false),
      isCollapsed,
      toggleCollapsed: () => setIsCollapsed(previous => {
        localStorage.setItem("portal-sidebar-collapsed", String(!previous));
        return !previous;
      }),
    }}>
      {children}
    </SidebarContext.Provider>
  );
}
