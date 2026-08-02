"use client";

import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

export default function BarcodeSvg({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    JsBarcode(svgRef.current, value, {
      format: /^\d{13}$/.test(value) ? "EAN13" : "CODE128",
      displayValue: true,
      fontSize: 14,
      height: 52,
      margin: 8,
      background: "#fff",
      lineColor: "#111",
    });
  }, [value]);

  return <svg ref={svgRef} role="img" aria-label={`Barkod ${value}`} />;
}
