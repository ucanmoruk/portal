import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserPool } from "@/lib/userStore";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    try {
        const pool = await getUserPool();
        const result = await pool.request().query(`
            SELECT ID, Kadi, Ad, Soyad, Gorev, Email, LaboratuvarBirimID
            FROM RootKullanici
            WHERE Durum = 'Aktif'
            ORDER BY Ad, Soyad
        `);

        return NextResponse.json(result.recordset.map((row: any) => ({
            id: row.ID,
            username: row.Kadi || "",
            name: [row.Ad, row.Soyad].filter(Boolean).join(" ").trim() || row.Kadi || `Kullanıcı #${row.ID}`,
            role: row.Gorev || "",
            email: row.Email || "",
            unitId: row.LaboratuvarBirimID ?? null,
        })));
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
