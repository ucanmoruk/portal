"use client";

import styles from "./print.module.css";
export default function PrintButton() {
  return <button className={styles.printButton} onClick={() => window.print()}>Yazdır / PDF kaydet</button>;
}
