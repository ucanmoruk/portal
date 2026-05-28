// Teklif yaşam döngüsü log helper'ı.
// Tüm aksiyonlar (Oluşturuldu / Düzeltildi / Revize / Onaylandı / Reddedildi)
// tek bir tabloda (TeklifOnayLog) toplanır.
//
//   • Internal aksiyonlar  → KullaniciID + KullaniciAd doldurulur
//   • Customer aksiyonlar  → MusteriAd + MusteriEmail + MusteriYetkili doldurulur
//
// Tablonun kendisi `app/api/teklifler/[id]/onay/route.ts:ensureLogTable` tarafından
// yaratılır (CREATE TABLE IF NOT EXISTS). Bu helper sadece INSERT yapar.

import poolPromise from "@/lib/db";

export type TeklifAksiyon =
    | "Oluşturuldu"
    | "Düzeltildi"
    | "Revize"
    | "Onaylandı"
    | "Reddedildi";

interface InternalLogArgs {
    teklifId: number;
    teklifNo: string;
    aksiyon: Exclude<TeklifAksiyon, "Onaylandı" | "Reddedildi">;
    aciklama?: string | null;
    kullaniciId?: number | null;
    kullaniciAd?: string | null;
    ipAdresi?: string | null;
}

const isPostgres = Boolean(process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL);

async function ensureLogTable() {
    const pool = await poolPromise;
    if (isPostgres) {
        await pool.request().query(`
            CREATE TABLE IF NOT EXISTS TeklifOnayLog (
                ID SERIAL PRIMARY KEY,
                TeklifID INTEGER NOT NULL,
                TeklifNo VARCHAR(50) NULL,
                Aksiyon VARCHAR(20) NOT NULL,
                Aciklama TEXT NULL,
                IpAdresi VARCHAR(100) NULL,
                UserAgent VARCHAR(500) NULL,
                MusteriAd VARCHAR(255) NULL,
                MusteriEmail VARCHAR(255) NULL,
                MusteriYetkili VARCHAR(255) NULL,
                KullaniciID INTEGER NULL,
                KullaniciAd VARCHAR(255) NULL,
                Tarih TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);
        return;
    }
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TeklifOnayLog]') AND type in (N'U'))
        BEGIN
            CREATE TABLE [dbo].[TeklifOnayLog] (
                [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                [TeklifID] INT NOT NULL,
                [TeklifNo] NVARCHAR(50) NULL,
                [Aksiyon] NVARCHAR(20) NOT NULL,
                [Aciklama] NVARCHAR(MAX) NULL,
                [IpAdresi] NVARCHAR(100) NULL,
                [UserAgent] NVARCHAR(500) NULL,
                [MusteriAd] NVARCHAR(255) NULL,
                [MusteriEmail] NVARCHAR(255) NULL,
                [MusteriYetkili] NVARCHAR(255) NULL,
                [KullaniciID] INT NULL,
                [KullaniciAd] NVARCHAR(255) NULL,
                [Tarih] DATETIME NOT NULL DEFAULT GETDATE()
            )
        END
    `);
}

/**
 * Internal kullanıcı eylemi için log düşer (Oluşturuldu / Düzeltildi / Revize).
 * Müşteri eylemleri için `app/api/teklifler/[id]/onay/route.ts:writeLog` kullanılır.
 */
export async function writeInternalTeklifLog(args: InternalLogArgs) {
    await ensureLogTable();
    const pool = await poolPromise;
    await pool.request()
        .input("TeklifID", args.teklifId)
        .input("TeklifNo", args.teklifNo)
        .input("Aksiyon", args.aksiyon)
        .input("Aciklama", args.aciklama || null)
        .input("IpAdresi", args.ipAdresi || null)
        .input("KullaniciID", args.kullaniciId ?? null)
        .input("KullaniciAd", args.kullaniciAd || null)
        .query(`
            INSERT INTO TeklifOnayLog
                (TeklifID, TeklifNo, Aksiyon, Aciklama, IpAdresi, KullaniciID, KullaniciAd)
            VALUES
                (@TeklifID, @TeklifNo, @Aksiyon, @Aciklama, @IpAdresi, @KullaniciID, @KullaniciAd)
        `);
}

export function teklifNoLabel(no: number | null, rev: number) {
    if (!no) return "-";
    const yy = String(no).slice(0, 2);
    const seq = String(no).slice(2).padStart(4, "0");
    return rev > 0 ? `${yy}${seq}/${rev}` : `${yy}${seq}`;
}

export function clientIpFromRequest(headers: Headers) {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || "";
    return headers.get("x-real-ip") || "";
}
