import { query } from "@/lib/db_eurolab";

export async function ensureEurolabRawdataInstructionsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS eurolab_rawdata_instructions (
      id SERIAL PRIMARY KEY,
      standard VARCHAR(120) NOT NULL DEFAULT 'EN 71-1:2026',
      test_id VARCHAR(120),
      clause TEXT NOT NULL,
      method TEXT NOT NULL,
      title TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      file_size INTEGER NOT NULL DEFAULT 0,
      file_url TEXT,
      file_data BYTEA NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (standard, clause, method)
    );
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='eurolab_rawdata_instructions' AND column_name='test_id'
      ) THEN
        ALTER TABLE eurolab_rawdata_instructions ADD COLUMN test_id VARCHAR(120);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='eurolab_rawdata_instructions' AND column_name='file_data'
      ) THEN
        ALTER TABLE eurolab_rawdata_instructions ADD COLUMN file_data BYTEA;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='eurolab_rawdata_instructions' AND column_name='file_url'
      ) THEN
        ALTER TABLE eurolab_rawdata_instructions ADD COLUMN file_url TEXT;
      END IF;
    END $$;
  `);
}
