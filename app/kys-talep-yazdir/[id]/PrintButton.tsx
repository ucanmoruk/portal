"use client";

import styles from "./print.module.css";
export default function PrintButton({english=false}:{english?:boolean}) {
  return <button className={styles.printButton} onClick={() => window.print()}>{english ? "Print / Save PDF" : "Yazdır / PDF kaydet"}</button>;
}
