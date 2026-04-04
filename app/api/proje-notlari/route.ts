import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

const FILE = path.join(process.cwd(), "data", "proje-notlari.md");
const MAX_BYTES = 512 * 1024;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Giriş gerekli" }, { status: 401 });

  try {
    const text = await fs.readFile(FILE, "utf8");
    return Response.json({ text });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") {
      return Response.json({
        text:
          "# Proje notları\n\nDosya henüz oluşturulmadı. Kaydet ile `data/proje-notlari.md` oluşur.\n",
      });
    }
    return Response.json({ error: "Dosya okunamadı" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Giriş gerekli" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Geçersiz JSON" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || typeof (body as { text?: unknown }).text !== "string") {
    return Response.json({ error: "Geçersiz veri" }, { status: 400 });
  }
  const text = (body as { text: string }).text;
  if (text.length > MAX_BYTES) {
    return Response.json({ error: "Metin çok uzun (en fazla ~512 KB)" }, { status: 400 });
  }

  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, text, "utf8");
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Yazılamadı (salt okunur ortam olabilir). `data/proje-notlari.md` dosyasını editörde düzenleyin." },
      { status: 503 }
    );
  }
}
