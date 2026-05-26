// Validation 40'ın moduleData'sındaki komponent anahtarlarını yeniden adlandır.
// 38 → 40 kopyalama sonrası ad uyuşmazlığı oluştu; bu script onu düzeltir.
//
// Mapping (kaynak ad → hedef ad):
//   • "Cıva (Hg)"      → "Civa (Hg)"
//   • "Cadmium"        → "Kadmiyum"
//   • "Kurşun / Lead"  → "Kurşun"
//
// Her modül (LOD_LOQ, LINEARITY, …) altında bu isimler bulunursa, içeriği
// koruyup sadece KEY'i değiştirir. Diğer komponent verilerine dokunmaz.

import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

const envText = readFileSync(".env.local", "utf8");
for (const line of envText.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
}

const pool = createPool({ connectionString: process.env.EUROLAB_POSTGRES_URL });

const TARGET_ID = 40;
const NAME_MAP = {
    "Cıva (Hg)": "Civa (Hg)",
    "Cadmium": "Kadmiyum",
    "Kurşun / Lead": "Kurşun",
};

try {
    const { rows } = await pool.query(`
        SELECT id, code, COALESCE(config, '{}'::jsonb) AS config
        FROM eurolab_validations
        WHERE id = $1
    `, [TARGET_ID]);

    if (rows.length === 0) {
        console.error(`Validation id=${TARGET_ID} bulunamadı.`);
        process.exit(1);
    }

    const target = rows[0];
    const moduleData = target.config?.moduleData || {};

    console.log("─".repeat(70));
    console.log(`Hedef: id=${target.id}  kod=${target.code}`);
    console.log(`Yeniden adlandırma mapping:`);
    for (const [from, to] of Object.entries(NAME_MAP)) {
        console.log(`   "${from}"  →  "${to}"`);
    }
    console.log("─".repeat(70));

    const nextModuleData = {};
    let totalRenames = 0;

    for (const [moduleKey, compMap] of Object.entries(moduleData)) {
        if (!compMap || typeof compMap !== "object") {
            nextModuleData[moduleKey] = compMap;
            continue;
        }
        const nextCompMap = {};
        let renamesInModule = 0;

        for (const [oldName, value] of Object.entries(compMap)) {
            const newName = NAME_MAP[oldName] || oldName;
            // Hedefte aynı yeni-ad zaten varsa, mevcudu KORU ve uyar
            if (newName !== oldName && nextCompMap[newName]) {
                console.warn(`  ⚠️  ${moduleKey}: "${newName}" zaten mevcut, "${oldName}" atlandı`);
                continue;
            }
            nextCompMap[newName] = value;
            if (newName !== oldName) {
                renamesInModule++;
                totalRenames++;
            }
        }
        nextModuleData[moduleKey] = nextCompMap;
        if (renamesInModule > 0) {
            console.log(`  ${moduleKey}: ${renamesInModule} key yeniden adlandırıldı`);
        }
    }

    if (totalRenames === 0) {
        console.log("Hiçbir key eşleşmedi — değişiklik yok, iptal.");
        process.exit(0);
    }

    const nextConfig = {
        ...(target.config || {}),
        moduleData: nextModuleData,
    };

    const updateResult = await pool.query(`
        UPDATE eurolab_validations
        SET config = $2::jsonb
        WHERE id = $1
        RETURNING id, code
    `, [TARGET_ID, JSON.stringify(nextConfig)]);

    if (updateResult.rowCount === 1) {
        console.log(`\n✅ Başarılı: id=${updateResult.rows[0].id} (kod=${updateResult.rows[0].code}) güncellendi.`);
        console.log(`   Toplam ${totalRenames} key yeniden adlandırıldı.`);
    } else {
        console.error(`\n❌ UPDATE başarısız: rowCount=${updateResult.rowCount}`);
        process.exit(1);
    }
} catch (error) {
    console.error("Hata:", error);
    process.exit(1);
} finally {
    await pool.end();
}
