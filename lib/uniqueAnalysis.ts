import { query } from "@/lib/db_eurolab";
import { cosmoPool } from "@/lib/db";
let ready: Promise<void> | undefined;
// Runs only inside withUniqueAnalysis: all names below are mapped to unique_* tables.
export async function ensureUniqueAnalysis() {
 if (!ready) ready = (async () => {
  await query(`CREATE TABLE IF NOT EXISTS eurolab_methods (
   id SERIAL PRIMARY KEY, method_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, technique TEXT, matrix TEXT,
   personnel JSONB DEFAULT '[]'::jsonb, instruction JSONB, validation_date DATE, status TEXT DEFAULT 'Active', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  ); CREATE SEQUENCE IF NOT EXISTS eurolab_validation_code_seq START 1;
  CREATE TABLE IF NOT EXISTS eurolab_validations (
   id SERIAL PRIMARY KEY, code TEXT UNIQUE, title TEXT NOT NULL, method_id INTEGER REFERENCES eurolab_methods(id), study_type TEXT,
   status TEXT DEFAULT 'IN_PROGRESS', planned_start_date DATE, planned_end_date DATE, study_date DATE DEFAULT CURRENT_DATE,
   config JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`);
  // Import identity only from Unique's controlled SOP documents; never import Eurolab studies or QC results.
  const pool = await cosmoPool;
  const docs = (await pool.request().query("SELECT ID,Kod,Baslik FROM KysDokuman WHERE Tur='SOP' AND Durum<>'Silindi' AND Durum<>'Arşiv'")).recordset;
  for (const doc of docs) await query("INSERT INTO eurolab_methods (method_code,name,technique,matrix,personnel) VALUES ($1,$2,'','', '[]'::jsonb) ON CONFLICT (method_code) DO NOTHING", [doc.Kod, doc.Baslik]);
 })().catch(error => { ready = undefined; throw error; });
 await ready;
}
