import { query } from "@/lib/db_eurolab";

export async function ensureEurolabInventoryTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS eurolab_inventory (
      id SERIAL PRIMARY KEY,
      code VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      serial_lot_no VARCHAR(160),
      intended_use VARCHAR(40) NOT NULL DEFAULT 'Numune Hazırlama',
      uncertainty_component VARCHAR(255),
      value_text VARCHAR(120),
      uncertainty_value NUMERIC(18, 6),
      unit VARCHAR(40),
      cas_no VARCHAR(80),
      limit_info VARCHAR(255),
      distribution_type VARCHAR(40) NOT NULL DEFAULT 'Dikdörtgen',
      status VARCHAR(20) NOT NULL DEFAULT 'Active',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_inventory' AND column_name='serial_lot_no') THEN
        ALTER TABLE eurolab_inventory ADD COLUMN serial_lot_no VARCHAR(160);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_inventory' AND column_name='intended_use') THEN
        ALTER TABLE eurolab_inventory ADD COLUMN intended_use VARCHAR(40) NOT NULL DEFAULT 'Numune Hazırlama';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_inventory' AND column_name='uncertainty_value') THEN
        ALTER TABLE eurolab_inventory ADD COLUMN uncertainty_value NUMERIC(18, 6);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_inventory' AND column_name='uncertainty_component') THEN
        ALTER TABLE eurolab_inventory ADD COLUMN uncertainty_component VARCHAR(255);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_inventory' AND column_name='value_text') THEN
        ALTER TABLE eurolab_inventory ADD COLUMN value_text VARCHAR(120);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_inventory' AND column_name='unit') THEN
        ALTER TABLE eurolab_inventory ADD COLUMN unit VARCHAR(40);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_inventory' AND column_name='cas_no') THEN
        ALTER TABLE eurolab_inventory ADD COLUMN cas_no VARCHAR(80);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_inventory' AND column_name='limit_info') THEN
        ALTER TABLE eurolab_inventory ADD COLUMN limit_info VARCHAR(255);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_inventory' AND column_name='distribution_type') THEN
        ALTER TABLE eurolab_inventory ADD COLUMN distribution_type VARCHAR(40) NOT NULL DEFAULT 'Dikdörtgen';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_inventory' AND column_name='status') THEN
        ALTER TABLE eurolab_inventory ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Active';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_inventory' AND column_name='updated_at') THEN
        ALTER TABLE eurolab_inventory ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      END IF;
    END $$;
  `);
}
