import { query } from "@/lib/db_eurolab";

export async function ensureEurolabRawdataTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS eurolab_rawdata (
      id SERIAL PRIMARY KEY,
      code VARCHAR(80) UNIQUE NOT NULL,
      sample_name VARCHAR(255) NOT NULL,
      standard VARCHAR(120) NOT NULL DEFAULT 'EN 71-1:2026',
      toy_category VARCHAR(120),
      age_group VARCHAR(80),
      status VARCHAR(30) NOT NULL DEFAULT 'Taslak',
      product_data JSONB,
      test_data JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_rawdata' AND column_name='toy_category') THEN
        ALTER TABLE eurolab_rawdata ADD COLUMN toy_category VARCHAR(120);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_rawdata' AND column_name='age_group') THEN
        ALTER TABLE eurolab_rawdata ADD COLUMN age_group VARCHAR(80);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_rawdata' AND column_name='status') THEN
        ALTER TABLE eurolab_rawdata ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'Taslak';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_rawdata' AND column_name='product_data') THEN
        ALTER TABLE eurolab_rawdata ADD COLUMN product_data JSONB;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_rawdata' AND column_name='test_data') THEN
        ALTER TABLE eurolab_rawdata ADD COLUMN test_data JSONB;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_rawdata' AND column_name='updated_at') THEN
        ALTER TABLE eurolab_rawdata ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      END IF;
    END $$;
  `);
}
