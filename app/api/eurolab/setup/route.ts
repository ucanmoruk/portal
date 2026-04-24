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

        return NextResponse.json({ message: "Eurolab veritabanı başarıyla güncellendi." });
    } catch (error: any) {
        console.error("Eurolab Setup Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
