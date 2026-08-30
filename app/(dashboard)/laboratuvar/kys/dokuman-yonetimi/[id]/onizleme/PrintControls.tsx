"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import styles from "./onizleme.module.css";

export default function PrintControls({ autoPrint }: { autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  return <button type="button" className={styles.printButton} onClick={() => window.print()}><Printer size={18} />Yazdır / PDF</button>;
}
