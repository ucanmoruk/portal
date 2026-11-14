import { execFile } from "node:child_process";
import path from "node:path";
let job = { running: false, error: "", completedAt: "" };
export function verificationJob() { return job; }
export function startVerification() {
 if (job.running) return job;
 job = { running: true, error: "", completedAt: "" };
 execFile(process.execPath, [path.join(process.cwd(), "scripts/verify-kys.cjs")], { cwd: process.cwd(), timeout: 720000, maxBuffer: 200000 }, (error, stdout, stderr) => {
  job = { running: false, completedAt: new Date().toISOString(), error: error && !stdout.includes("Rapor:") ? (stderr || "Doğrulama çalıştırılamadı.").slice(-1500) : "" };
 });
 return job;
}
