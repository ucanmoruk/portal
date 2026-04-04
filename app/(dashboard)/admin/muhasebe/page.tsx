"use client";

import { useEffect, useRef } from "react";

export default function MuhasebePage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const resize = () => {
      if (iframeRef.current) {
        iframeRef.current.style.height = `${window.innerHeight - 52}px`;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="/muhasebe-paneli.html"
      style={{
        display: "block",
        border: "none",
        marginTop: -24,
        marginLeft: -24,
        width: "calc(100% + 48px)",
      }}
      title="Muhasebe Ödeme Takip Portalı"
    />
  );
}
