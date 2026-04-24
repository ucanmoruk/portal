import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createReport } from 'docx-templates';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { instruction, method } = body;

        const templatePath = path.join(process.cwd(), 'sablon', 'talimat_sablon.docx');
        
        if (!fs.existsSync(templatePath)) {
            return new NextResponse(JSON.stringify({ error: 'Şablon dosyası bulunamadı.' }), { status: 404 });
        }

        const templateBuffer = fs.readFileSync(templatePath);
        
        // HTML'i Word'ün (altChunk) sorunsuz okuyabilmesi için tam bir sayfa yapısına saralım
        const wrapHtml = (html: string) => {
            if (!html) return '';
            const cleaned = html.replace(/&nbsp;/g, ' ').replace(/<p><\/p>/g, '');
            return `<html><head><meta charset="UTF-8"></head><body>${cleaned}</body></html>`;
        };

        const data = {
            kod: String(method?.method_code || ''),
            ad: String(method?.name || ''),
            matriks: String(method?.matrix || ''),
            test: 'SİSTEM AKTİF - TEST BAŞARILI',
            
            // HTML Destekli (Şablonda +++HTML s1+++ şeklinde kullanılmalı)
            s1: wrapHtml(instruction?.["1.0"] || ''),
            s2: wrapHtml(instruction?.["2.0"] || ''),
            s3: wrapHtml(instruction?.["3.0"] || ''),
            s3_1: wrapHtml(instruction?.["3.1"] || ''),
            s3_2: wrapHtml(instruction?.["3.2"] || ''),
            s3_3: wrapHtml(instruction?.["3.3"] || ''),
            s3_4: wrapHtml(instruction?.["3.4"] || ''),
            s3_5: wrapHtml(instruction?.["3.5"] || ''),
            s4: wrapHtml(instruction?.["4.0"] || ''),
            s5: wrapHtml(instruction?.["5.0"] || ''),
            s6: wrapHtml(instruction?.["6.0"] || ''),
            s7: wrapHtml(instruction?.["7.0"] || ''),
            s8: wrapHtml(instruction?.["8.0"] || ''),
            s9: wrapHtml(instruction?.["9.0"] || ''),

            // Düz Metin (Şablonda +++t1+++ şeklinde kullanılmalı)
            t1: String(instruction?.["1.0"] || '').replace(/<[^>]*>/g, ''),
            t3_1: String(instruction?.["3.1"] || '').replace(/<[^>]*>/g, ''),
        };

        const buffer = await createReport({
            template: templateBuffer,
            data,
            cmdDelimiter: ['+++', '+++'],
        });

        const safeCode = (method?.method_code || 'Talimat').replace(/[^a-z0-9]/gi, '_');
        const filename = `${safeCode}.docx`;

        return new NextResponse(Buffer.from(buffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error: any) {
        console.error("Word Download Error:", error);
        return new NextResponse(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
