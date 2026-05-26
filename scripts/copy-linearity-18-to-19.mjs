// Bir defalık veri kopyalama: validation 18 (K.SOP.27) → validation 19 (K.SOP.90)
//   • Yalnız config.moduleData.LINEARITY blokunu kopyalar
//   • Hedefin diğer modülleri (LOD/LOQ, Repeatability vs.) dokunulmaz
//   • Önce ÖNİZLEME yazdırır, sonra UPDATE çalıştırır
//
// Çalıştırma:  node scripts/copy-linearity-18-to-19.mjs
// Geri alma:   Hedef config'in yedeği aşağıda --backup ile yazdırılıyor.

import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

// .env.local'i elle yükle (dotenv kullanmamak için)
const envText = readFileSync(".env.local", "utf8");
for (const line of envText.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
}

const connectionString = process.env.EUROLAB_POSTGRES_URL || process.env.POSTGRES_URL;
if (!connectionString) {
    console.error("EUROLAB_POSTGRES_URL .env.local içinde tanımlı değil.");
    process.exit(1);
}

const pool = createPool({ connectionString });

const SOURCE_ID = 18;
const TARGET_ID = 19;

try {
    // 1) Kaynak ve hedef config'i çek
    const { rows } = await pool.query(`
        SELECT id, code, COALESCE(config, '{}'::jsonb) AS config
        FROM eurolab_validations
        WHERE id IN ($1, $2)
        ORDER BY id
    `, [SOURCE_ID, TARGET_ID]);

    if (rows.length !== 2) {
        console.error(`Beklenen 2 kayıt, bulunan ${rows.length}. Kayıtlar:`, rows.map(r => r.id));
        process.exit(1);
    }

    const source = rows.find(r => Number(r.id) === SOURCE_ID);
    const target = rows.find(r => Number(r.id) === TARGET_ID);

    const sourceLinearity = source.config?.moduleData?.LINEARITY;
    if (!sourceLinearity || Object.keys(sourceLinearity).length === 0) {
        console.error(`Kaynak (id=${SOURCE_ID}, kod=${source.code}) içinde LINEARITY verisi yok. İptal.`);
        process.exit(1);
    }

    const sourceComps = Object.keys(sourceLinearity);
    const targetExisting = target.config?.moduleData?.LINEARITY || {};
    const targetExistingComps = Object.keys(targetExisting);

    console.log("─".repeat(60));
    console.log(`Kaynak  : id=${source.id}  kod=${source.code}`);
    console.log(`Hedef   : id=${target.id}  kod=${target.code}`);
    console.log(`Kaynak LINEARITY komponentleri: ${sourceComps.join(", ")}`);
    console.log(`Hedef'in mevcut LINEARITY komponentleri (üzerine yazılacak): ${targetExistingComps.length > 0 ? targetExistingComps.join(", ") : "(yok)"}`);
    console.log("─".repeat(60));

    // 2) Hedef config'in YEDEK'ini stdout'a yaz (geri almak için)
    console.log("\n[BACKUP] Hedefin mevcut config.moduleData.LINEARITY değeri (geri almak gerekirse):");
    console.log(JSON.stringify(targetExisting, null, 2));
    console.log("─".repeat(60));

    // 3) Hedef config'i topla: mevcut config + moduleData içine LINEARITY override
    const nextConfig = {
        ...(target.config || {}),
        moduleData: {
            ...(target.config?.moduleData || {}),
            LINEARITY: sourceLinearity,
        },
    };

    // 4) UPDATE çalıştır
    const updateResult = await pool.query(`
        UPDATE eurolab_validations
        SET config = $2::jsonb
        WHERE id = $1
        RETURNING id, code
    `, [TARGET_ID, JSON.stringify(nextConfig)]);

    if (updateResult.rowCount === 1) {
        console.log(`\n✅ Başarılı: id=${updateResult.rows[0].id} (kod=${updateResult.rows[0].code}) güncellendi.`);
        console.log(`   ${sourceComps.length} komponent için LINEARITY verisi kopyalandı.`);
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
