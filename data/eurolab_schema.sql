-- Eurolab Modülü — Vercel Postgres (PostgreSQL) Şeması

-- 1. Metotlar Tablosu
CREATE TABLE eurolab_methods (
    id SERIAL PRIMARY KEY,
    method_code VARCHAR(50) UNIQUE NOT NULL, -- Örn: M001
    name VARCHAR(255) NOT NULL,              -- Örn: HPLC ile Kahvede Kafein Tayini
    technique VARCHAR(100),                 -- Örn: HPLC-UV
    matrix VARCHAR(100),                    -- Örn: Gıda, Su, vb.
    personnel JSONB,                        -- Yetkili personel listesi (Dizi olarak)
    instruction JSONB,                      -- Analiz talimatı (9 bölüm)
    validation_date DATE,
    status VARCHAR(20) DEFAULT 'Active',    -- Active, Passive
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Validasyon Çalışmaları Tablosu
CREATE TABLE eurolab_validations (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    method_id INTEGER REFERENCES eurolab_methods(id) ON DELETE CASCADE,
    study_type VARCHAR(50),                 -- FULL_VALIDATION, RE-VALIDATION
    status VARCHAR(20) DEFAULT 'IN_PROGRESS',
    study_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Validasyon Modül Verileri (LOD, Linearity vb.)
-- Karmaşık hesaplama verilerini esneklik için JSONB formatında saklıyoruz
CREATE TABLE eurolab_validation_results (
    id SERIAL PRIMARY KEY,
    validation_id INTEGER REFERENCES eurolab_validations(id) ON DELETE CASCADE,
    module_type VARCHAR(50) NOT NULL,       -- lod, linearity, precision, trueness
    data JSONB NOT NULL,                    -- Hesaplama verileri, noktalar, sonuçlar
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(validation_id, module_type)
);

-- 4. QC Kartları
CREATE TABLE eurolab_qc_cards (
    id SERIAL PRIMARY KEY,
    code VARCHAR(60) UNIQUE,
    validation_id INTEGER REFERENCES eurolab_validations(id) ON DELETE CASCADE,
    validation_code VARCHAR(60),
    method_name VARCHAR(255),
    component_name VARCHAR(255) NOT NULL,
    card_type VARCHAR(30) NOT NULL DEFAULT 'RANGE',
    lower_limit NUMERIC NOT NULL,
    center_line NUMERIC NOT NULL,
    upper_limit NUMERIC NOT NULL,
    unit VARCHAR(50),
    source_data JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(validation_id, component_name, card_type)
);

CREATE TABLE eurolab_qc_card_points (
    id SERIAL PRIMARY KEY,
    card_id INTEGER REFERENCES eurolab_qc_cards(id) ON DELETE CASCADE,
    sequence_no INTEGER NOT NULL,
    label VARCHAR(120),
    analyst VARCHAR(160),
    value NUMERIC,
    recovery NUMERIC NOT NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    locked BOOLEAN NOT NULL DEFAULT false,
    measured_at DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE eurolab_qc_card_audit_logs (
    id SERIAL PRIMARY KEY,
    card_id INTEGER REFERENCES eurolab_qc_cards(id) ON DELETE CASCADE,
    point_id INTEGER,
    action VARCHAR(30) NOT NULL,
    before_data JSONB,
    after_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Başlangıç Verileri (Seed Data)
INSERT INTO eurolab_methods (method_code, name, technique, matrix, personnel, validation_date, status) VALUES 
('M001', 'HPLC ile Kahvede Kafein Tayini', 'HPLC-UV', 'Gıda', '["Ayşe Demir"]', '2023-03-15', 'Active'),
('M002', 'Süt ve Süt Ürünlerinde Aflatoksin M1', 'HPLC-FLD', 'Gıda', '["Mehmet Kaya"]', '2023-06-20', 'Active'),
('M003', 'İçme Sularında Ağır Metal Analizi', 'ICP-MS', 'Su', '["Canan Çelik"]', '2023-09-10', 'Pending'),
('M004', 'Balda Pestisit Kalıntısı', 'GC-MS/MS', 'Gıda', '["Ayşe Demir", "Burak Yıldız"]', '2023-11-05', 'Active');

INSERT INTO eurolab_validations (title, method_id, study_type, status) VALUES 
('HPLC ile Kahvede Kafein Tayini Validasyonu', 1, 'FULL_VALIDATION', 'IN_PROGRESS');
