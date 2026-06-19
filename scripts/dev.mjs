// Dev başlatıcı — socketGuardPreload.cjs'i NODE_OPTIONS --require ile yükler.
// next dev'in spawn ettiği Turbopack jest-worker'ları env'i (NODE_OPTIONS) miras
// aldığı için guard ONLARDA da kurulur → EPIPE worker çökmesi ("Jest worker
// exceeding retry limit") önlenir. Port: argv[2] || 1038 (NEXTAUTH_URL ile uyumlu).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const preload = path.resolve(__dirname, "socketGuardPreload.cjs").replace(/\\/g, "/");
const port = process.argv[2] || process.env.PORT || "1038";

const env = { ...process.env };
const requireArg = `--require "${preload}"`;
env.NODE_OPTIONS = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ${requireArg}` : requireArg;

console.log(`[dev] socket guard preload aktif → ${preload}`);
console.log(`[dev] next dev -p ${port}`);

const child = spawn("npx", ["next", "dev", "-p", String(port)], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 0));
