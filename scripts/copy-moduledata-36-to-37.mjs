// Bir defalık veri kopyalama: validation 36 (K.SOP.38) → validation 37 (K.SOP.39)
//   • config.moduleData'nın TAMAMINI kopyalar
//   • Diğer config alanları (description, devices, personnel, components,
//     parameters, …) DOKUNULMAZ
//   • Komponent isim eşleştirme:
//       - Kaynaktaki ad hedefin config.components listesinde varsa → aynen kullan
//       - Yoksa fuzzy eşleştirme dener (case/whitespace/parantez normalize)
//       - Yine bulamazsa: orijinal adla yazar ve uyarır (UI'da görünmeyebilir)

import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

const envText = readFileSync(".env.local", "utf8");
for (const line of envText.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
}

const pool = createPool({ connectionString: process.env.EUROLAB_POSTGRES_URL });

const SOURCE_ID = 36;
const TARGET_ID = 37;

// Türkçe-uyumlu isim normalleştirme (eşleştirme için):
//   "Cıva (Hg)" / "Civa (Hg)" / "civa" → "civa"
const normalize = (name) =>
    String(name || "")
        .toLocaleLowerCase("tr-TR")
        .replace(/\s*\([^)]*\)/g, "")   // parantezli kısmı at
        .replace(/[\/\\,]/g, " ")         // ayırıcıları boşluğa çevir
        .replace(/\s+/g, " ")
        .replace(/ı/g, "i")               // ı → i
        .replace(/[şçğüö]/g, c => ({ ş: "s", ç: "c", ğ: "g", ü: "u", ö: "o" }[c] || c))
        .trim();

try {
    const { rows } = await pool.query(`
        SELECT id, code, COALESCE(config, '{}'::jsonb) AS config
        FROM eurolab_validations
        WHERE id IN ($1, $2)
        ORDER BY id
    `, [SOURCE_ID, TARGET_ID]);

    if (rows.length !== 2) {
        console.error(`Beklenen 2 kayıt, bulunan ${rows.length}.`, rows.map(r => r.id));
        process.exit(1);
    }

    const source = rows.find(r => Number(r.id) === SOURCE_ID);
    const target = rows.find(r => Number(r.id) === TARGET_ID);

    const sourceModuleData = source.config?.moduleData;
    if (!sourceModuleData || Object.keys(sourceModuleData).length === 0) {
        console.error(`Kaynak (id=${SOURCE_ID}, kod=${source.code}) içinde moduleData yok. İptal.`);
        process.exit(1);
    }

    const targetComponents = (target.config?.components || [])
        .map(c => String(c?.name || "").trim())
        .filter(Boolean);

    // Hedef komponentlerinin normalize edilmiş haline → orijinal ad eşleştirmesi
    const targetNormToOrig = new Map();
    for (const name of targetComponents) {
        targetNormToOrig.set(normalize(name), name);
    }

    console.log("─".repeat(72));
    console.log(`Kaynak  : id=${source.id}  kod=${source.code}`);
    console.log(`Hedef   : id=${target.id}  kod=${target.code}`);
    console.log(`Hedef config.components (${targetComponents.length}): ${targetComponents.join(", ")}`);

    // Tüm modüller için kaynak komponent adlarını topla (benzersiz)
    const sourceCompNames = new Set();
    for (const compMap of Object.values(sourceModuleData)) {
        if (compMap && typeof compMap === "object") {
            for (const name of Object.keys(compMap)) sourceCompNames.add(name);
        }
    }

    // Eşleştirme tablosunu oluştur
    const nameMap = new Map();  // sourceName → targetName (veya orijinal)
    const unmapped = [];
    for (const srcName of sourceCompNames) {
        if (targetNormToOrig.has(normalize(srcName))) {
            nameMap.set(srcName, targetNormToOrig.get(normalize(srcName)));
        } else {
            nameMap.set(srcName, srcName);
            unmapped.push(srcName);
        }
    }

    console.log("\nKomponent eşleştirmesi:");
    for (const [src, dst] of nameMap.entries()) {
        const marker = src === dst ? "✓" : "→";
        console.log(`   ${marker}  "${src}"${src !== dst ? `  →  "${dst}"` : ""}`);
    }
    if (unmapped.length > 0) {
        console.log(`\n⚠️  ${unmapped.length} komponent için hedefin listesinde eşleşme YOK:`);
        unmapped.forEach(n => console.log(`     • "${n}"  (orijinal adla yazılacak, UI'da görünmeyebilir)`));
    }
    console.log("─".repeat(72));

    // Yedek
    console.log("\n[BACKUP] Hedefin mevcut moduleData değeri (geri almak gerekirse):");
    console.log(JSON.stringify(target.config?.moduleData || {}, null, 2));
    console.log("─".repeat(72));

    // Yeni moduleData'yı oluştur — key'leri eşleştirme tablosuyla yeniden yaz
    const nextModuleData = {};
    for (const [moduleKey, compMap] of Object.entries(sourceModuleData)) {
        if (!compMap || typeof compMap !== "object") {
            nextModuleData[moduleKey] = compMap;
            continue;
        }
        const remapped = {};
        for (const [srcName, value] of Object.entries(compMap)) {
            const dstName = nameMap.get(srcName) || srcName;
            remapped[dstName] = value;
        }
        nextModuleData[moduleKey] = remapped;
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
        const moduleCount = Object.keys(sourceModuleData).length;
        const compCount = sourceCompNames.size;
        console.log(`\n✅ Başarılı: id=${updateResult.rows[0].id} (kod=${updateResult.rows[0].code}) güncellendi.`);
        console.log(`   ${moduleCount} modül, ${compCount} komponent kopyalandı.`);
        if (unmapped.length > 0) {
            console.log(`   ⚠️  ${unmapped.length} komponent eşleşmedi — UI'da görünmüyorsa söyle, manuel düzeltirim.`);
        }
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
