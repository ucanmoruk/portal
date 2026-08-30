"use client";

import { Printer } from "lucide-react";
import styles from "./print.module.css";

export default function PrintButton({ documentId }: { documentId: number }) {
  return <button type="button" className={styles.printButton} onClick={() => window.open(`/api/kys/dokumanlar/${documentId}/pdf`, "_blank", "noopener,noreferrer")}><Printer size={18} />PDF Oluştur / Yazdır</button>;
}
