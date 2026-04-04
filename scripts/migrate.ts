import * as sql from "mssql";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// Read .env.local
const envPath = path.resolve(__dirname, "../.env.local");
const env: Record<string, string> = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1]!.trim()] = m[2]!.trim();
}

const config: sql.config = {
  server:   env["DB_SERVER"]!,
  database: env["DB_NAME"]!,
  user:     env["DB_USER"]!,
  password: env["DB_PASSWORD"]!,
  options:  { encrypt: true, trustServerCertificate: true },
};

// Split migration SQL into individual statements
// Each IF...ALTER is one statement; each IF...BEGIN...END is one block.
function splitStatements(sql: string): string[] {
  const stmts: string[] = [];
  // Split on lines starting with "IF NOT EXISTS"
  const chunks = sql.split(/^(?=IF NOT EXISTS)/m);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (trimmed && !trimmed.startsWith("--")) stmts.push(trimmed);
  }
  return stmts;
}

async function main() {
  console.log("Connecting to", env["DB_SERVER"], "/", env["DB_NAME"], "...");
  const pool = await sql.connect(config);
  console.log("Connected.\n");

  const migrationSql = fs.readFileSync(
    path.resolve(__dirname, "../tmp/migration.sql"),
    "utf8"
  );

  const statements = splitStatements(migrationSql);
  console.log(`Running ${statements.length} statements...\n`);

  let ok = 0;
  let fail = 0;

  for (const stmt of statements) {
    const preview = stmt.split("\n")[0]!.slice(0, 80);
    try {
      await pool.request().query(stmt);
      console.log("  ✓", preview);
      ok++;
    } catch (e: any) {
      console.error("  ✗", preview);
      console.error("    ERROR:", e.message);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} succeeded, ${fail} failed.`);
  await pool.close();
}

main().catch(e => { console.error(e); process.exit(1); });
