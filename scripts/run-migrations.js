#!/usr/bin/env node

/**
 * Migration Runner
 * Executes SQL migrations from /migrations directory
 * Usage: node scripts/run-migrations.js
 */

const fs = require("fs");
const path = require("path");
const mssql = require("mssql");

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  });
}

const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  server: process.env.DB_SERVER || "localhost",
  port: 1433,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

async function runMigrations() {
  const pool = new mssql.ConnectionPool(sqlConfig);

  try {
    console.log("🔄 Veritabanı bağlantısı kuruluyor...");
    await pool.connect();
    console.log("✅ Bağlantı başarılı!\n");

    const migrationsDir = path.join(__dirname, "..", "migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    console.log(`📄 ${files.length} migration dosyası bulundu:\n`);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");

      console.log(`▶️  Çalıştırılıyor: ${file}`);

      try {
        const request = pool.request();
        await request.batch(sql);
        console.log(`✅ ${file} başarılı\n`);
      } catch (err) {
        console.error(`❌ ${file} hatası:`, err.message, "\n");
        throw err;
      }
    }

    console.log("🎉 Tüm migrations başarılı!");
  } catch (err) {
    console.error("❌ Migration hatası:", err);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

runMigrations();
