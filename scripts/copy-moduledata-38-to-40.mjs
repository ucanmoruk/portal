// Bir defalık veri kopyalama: validation 38 (K.SOP.36) → validation 40 (K.SOP.28)
//   • config.moduleData'nın TAMAMINI kopyalar (LOD/LOQ + Lineerlik +
//     Tekrarlanabilirlik + Tekrar-Üretilebilirlik + Gerçeklik + …)
//   • Hedefin config'in diğer alanları (description, devices, personnel,
//     components, parameters, vs.) DOKUNULMAZ
//   • Üzerine yazma davranışı: hedefin mevcut moduleData'sı kaynağınkiyle
//     TAM olarak değiştirilir. Eski yedek stdout'a yazdırılır.
//
// Çalıştırma:  node scripts/copy-moduledata-38-to-40.mjs

import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

// .env.local'i elle yükle
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

const SOURCE_ID = 38;
const TARGET_ID = 40;

try {
    const { rows } = await pool.query(`
        SELECT id, code, COALESCE(config, '{}'::jsonb) AS config
        FROM eurolab_validations
        WHERE id IN ($1, $2)
        ORDER BY id
    `, [SOURCE_ID, TARGET_ID]);

    if (rows.length !== 2) {
        console.error(`Beklenen 2 kayıt, bulunan ${rows.length}.`);
        console.error("Bulunan id'ler:", rows.map(r => r.id));
        process.exit(1);
    }

    const source = rows.find(r => Number(r.id) === SOURCE_ID);
    const target = rows.find(r => Number(r.id) === TARGET_ID);

    const sourceModuleData = source.config?.moduleData;
    if (!sourceModuleData || Object.keys(sourceModuleData).length === 0) {
        console.error(`Kaynak (id=${SOURCE_ID}, kod=${source.code}) içinde moduleData yok. İptal.`);
        process.exit(1);
    }

    const sourceModules = Object.keys(sourceModuleData);
    const targetExistingModuleData = target.config?.moduleData || {};
    const targetExistingModules = Object.keys(targetExistingModuleData);

    console.log("─".repeat(70));
    console.log(`Kaynak  : id=${source.id}  kod=${source.code}`);
    console.log(`Hedef   : id=${target.id}  kod=${target.code}`);
    console.log(`Kaynak modülleri: ${sourceModules.join(", ")}`);
    for (const m of sourceModules) {
        const comps = Object.keys(sourceModuleData[m] || {});
        console.log(`   ${m}: ${comps.length} komponent`);
    }
    console.log(`Hedef'in mevcut modülleri (üzerine yazılacak): ${targetExistingModules.length > 0 ? targetExistingModules.join(", ") : "(yok)"}`);
    console.log("─".repeat(70));

    // YEDEK — geri alma için stdout'a yaz
    console.log("\n[BACKUP] Hedefin mevcut config.moduleData değeri (geri almak gerekirse):");
    console.log(JSON.stringify(targetExistingModuleData, null, 2));
    console.log("─".repeat(70));

    // Hedef config'i topla: mevcut + moduleData üzerine yaz
    const nextConfig = {
        ...(target.config || {}),
        moduleData: sourceModuleData,
    };

    const updateResult = await pool.query(`
        UPDATE eurolab_validations
        SET config = $2::jsonb
        WHERE id = $1
        RETURNING id, code
    `, [TARGET_ID, JSON.stringify(nextConfig)]);

    if (updateResult.rowCount === 1) {
        console.log(`\n✅ Başarılı: id=${updateResult.rows[0].id} (kod=${updateResult.rows[0].code}) güncellendi.`);
        console.log(`   ${sourceModules.length} modül kopyalandı.`);
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
