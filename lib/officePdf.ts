import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
let conversionQueue: Promise<unknown> = Promise.resolve();

export function isWordFile(type: string, name: string) {
  return ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(type)
    || /\.docx?$/i.test(name);
}

async function convert(source: Buffer, name: string): Promise<{ buffer: Buffer; engine: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kys-word-pdf-"));
  const extension = /\.doc$/i.test(name) ? ".doc" : ".docx";
  const input = path.join(directory, `source${extension}`);
  const output = path.join(directory, "source.pdf");
  try {
    await writeFile(input, source);
    if (process.platform !== "win32") {
      throw new Error("Bu Word belgesi için özgün düzeni koruyan PDF henüz hazırlanmamış. Word dönüşümü Windows üzerinde tamamlanmalıdır.");
    }
    await execFileAsync(process.env.KYS_WORD_POWERSHELL || "pwsh.exe", ["-NoProfile", "-NonInteractive", "-File",
      path.join(process.cwd(), "scripts", "convert-word-to-pdf.ps1"), "-InputPath", input, "-OutputPath", output],
    { windowsHide: true, timeout: 120_000, maxBuffer: 1024 * 1024 });
    const buffer = await readFile(output);
    if (buffer.subarray(0, 5).toString() !== "%PDF-") throw new Error("Word geçerli bir PDF oluşturamadı.");
    return { buffer, engine: "Microsoft Word native PDF" };
  } finally {
    // directory is created by mkdtemp under the OS temp directory for this operation only.
    if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith("kys-word-pdf-")) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export function convertWordToPdf(source: Buffer, name: string) {
  const result = conversionQueue.then(() => convert(source, name));
  conversionQueue = result.catch(() => undefined);
  return result;
}
