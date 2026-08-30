"use client";

import { Printer } from "lucide-react";
import styles from "./onizleme.module.css";

export default function PrintControls({ documentId }: { documentId: number }) {
  return (
    <button
      type="button"
      className={styles.printButton}
      onClick={() => window.open(`/kys-dokuman-yazdir/${documentId}?print=1`, "_blank", "noopener,noreferrer")}
    >
      <Printer size={18} />Yazdır / PDF
    </button>
  );
}
