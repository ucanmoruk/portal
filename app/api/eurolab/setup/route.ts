import { NextResponse } from "next/server";
import { query } from "@/lib/db_eurolab";

// GET /api/eurolab/setup -> Veritabanını günceller / kurur
export async function GET() {
    try {
        // Tabloları oluşturma (varsa dokunmaz)
        await query(`
            CREATE TABLE IF NOT EXISTS eurolab_methods (
                id SERIAL PRIMARY KEY,
                method_code VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                technique VARCHAR(100),
                matrix VARCHAR(100),
                personnel JSONB,
                instruction JSONB,
                validation_date DATE,
                status VARCHAR(20) DEFAULT 'Active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Eksik sütunları ekleme (Migrasyon desteği)
        await query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_methods' AND column_name='instruction') THEN
                    ALTER TABLE eurolab_methods ADD COLUMN instruction JSONB;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_methods' AND column_name='matrix') THEN
                    ALTER TABLE eurolab_methods ADD COLUMN matrix VARCHAR(100);
                END IF;
            END $$;
        `);

        await query(`
            CREATE SEQUENCE IF NOT EXISTS eurolab_validation_code_seq START 1;

            CREATE TABLE IF NOT EXISTS eurolab_validations (
                id SERIAL PRIMARY KEY,
                code VARCHAR(40) UNIQUE,
                title VARCHAR(255) NOT NULL,
                method_id INTEGER REFERENCES eurolab_methods(id) ON DELETE CASCADE,
                study_type VARCHAR(50),
                status VARCHAR(30) DEFAULT 'IN_PROGRESS',
                planned_start_date DATE,
                planned_end_date DATE,
                study_date DATE DEFAULT CURRENT_DATE,
                config JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_validations' AND column_name='code') THEN
                    ALTER TABLE eurolab_validations ADD COLUMN code VARCHAR(40) UNIQUE;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_validations' AND column_name='planned_start_date') THEN
                    ALTER TABLE eurolab_validations ADD COLUMN planned_start_date DATE;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_validations' AND column_name='planned_end_date') THEN
                    ALTER TABLE eurolab_validations ADD COLUMN planned_end_date DATE;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_validations' AND column_name='config') THEN
                    ALTER TABLE eurolab_validations ADD COLUMN config JSONB DEFAULT '{}'::jsonb;
                END IF;
            END $$;
        `);

        return NextResponse.json({ message: "Eurolab veritabanı başarıyla güncellendi." });
    } catch (error: any) {
        console.error("Eurolab Setup Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
