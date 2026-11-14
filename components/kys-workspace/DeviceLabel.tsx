"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import type { WorkspaceRecord } from "@/lib/kysWorkspaceConfig";
import s from "./Workspace.module.css";
export default function DeviceLabel({ device, calibration }: { device: WorkspaceRecord; calibration?: WorkspaceRecord }) {
 const [qr, setQr] = useState("");
 useEffect(() => { let active = true; void QRCode.toDataURL(`${window.location.origin}/laboratuvar/kys/cihaz-listesi/${device.id}`, { width: 240, margin: 1 }).then(url => { if (active) setQr(url); }); return () => { active = false; }; }, [device.id]);
 const date = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("tr-TR") : "—";
 return <main style={{ padding: 24 }}><div className={s.noPrint} style={{ marginBottom: 20 }}><h1 style={{ fontSize: 20, marginBottom: 10 }}>Cihaz etiketi · {device.data.code}</h1><button className={s.button} disabled={!qr} onClick={() => window.print()}>Etiketi yazdır</button><p className={s.muted}>Etiket genişliği 90 mm. QR kodu cihazın oturum korumalı sicil kartına gider.</p></div><div className={s.label}>{qr && <Image src={qr} width={80} height={80} unoptimized alt="Cihaz sicil kartı QR kodu" />}<div><strong>{device.data.code}</strong><div>{device.data.name}</div><small>{device.data.brand} {device.data.model}</small><small>Seri no: {device.data.serial || "—"}</small><small>{device.data.unit} · {device.status}</small><small>Kalibrasyon: {date(calibration?.data.performedAt)}</small><small>Sonraki: {date(calibration?.data.nextDate)}</small></div></div></main>;
}
