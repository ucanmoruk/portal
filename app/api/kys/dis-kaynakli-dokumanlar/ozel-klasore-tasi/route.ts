import { getPortalUser } from "@/lib/portalYetki";
import { legacyPublicBase, moveLegacyPdfsToPrivate } from "@/lib/kysDisKaynakliFtpUpload";

// Yalnızca yönetici: eski herkese açık klasördeki dış kaynaklı PDF'leri web köküne bağlı olmayan özel klasöre taşır
// ve taşınan her dosyanın eski adresinin artık açılmadığını doğrular. Tekrar çalıştırılabilir.
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const fail = (message: string, status: number) => Response.json({ error: message }, { status });

export async function POST() {
  const user = await getPortalUser();
  if (!user) return fail("Oturum açmanız gerekiyor.", 401);
  if (!user.isAdmin) return fail("Bu işlem yalnızca yöneticiler içindir.", 403);
  try {
    const result = await moveLegacyPdfsToPrivate();
    const base = legacyPublicBase();
    const stillPublic: string[] = [];
    const queue = [...result.moved];
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (let name = queue.shift(); name; name = queue.shift()) {
        try {
          const res = await fetch(`${base}/${name}`, { method: "HEAD", redirect: "follow", cache: "no-store" });
          if (res.ok) stillPublic.push(name);
        } catch { /* Ulaşılamıyorsa açık değildir. */ }
      }
    }));
    return Response.json({ moved: result.moved.length, skipped: result.skipped, failed: result.failed, stillPublic });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Taşıma başarısız.", 500);
  }
}
