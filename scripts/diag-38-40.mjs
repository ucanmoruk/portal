// Tanı: validation 38 ve 40'ın config.components + moduleData komponentlerini
// karşılaştır. Civa/Kurşun/Kadmiyum eksikse nereden kaynaklandığını bul.

import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

const envText = readFileSync(".env.local", "utf8");
for (const line of envText.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
}

const pool = createPool({ connectionString: process.env.EUROLAB_POSTGRES_URL });

const { rows } = await pool.query(`
    SELECT id, code, COALESCE(config, '{}'::jsonb) AS config
    FROM eurolab_validations
    WHERE id IN (38, 40)
    ORDER BY id
`);

for (const row of rows) {
    console.log("=".repeat(70));
    console.log(`id=${row.id}  kod=${row.code}`);
    const compConfig = (row.config?.components || []).map(c => c?.name).filter(Boolean);
    console.log(`config.components (${compConfig.length}):`);
    compConfig.forEach(n => console.log(`   • ${n}`));

    const moduleData = row.config?.moduleData || {};
    for (const [moduleKey, compMap] of Object.entries(moduleData)) {
        const names = Object.keys(compMap || {});
        console.log(`\nmoduleData.${moduleKey} (${names.length} komponent):`);
        names.forEach(n => console.log(`   • ${n}`));
    }
}

await pool.end();
