import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createReport } from 'docx-templates';

const decodeHtmlEntities = (value: string) => value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

const htmlToWordText = (html: unknown) => {
    if (!html) return '';

    const text = String(html)
        .replace(/\r?\n/g, ' ')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/\s*p\s*>/gi, '\n')
        .replace(/<\/\s*div\s*>/gi, '\n')
        .replace(/<\/\s*li\s*>/gi, '\n')
        .replace(/<\s*li[^>]*>/gi, '- ')
        .replace(/<\/\s*h[1-6]\s*>/gi, '\n')
        .replace(/<[^>]+>/g, '');

    return decodeHtmlEntities(text)
        .split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
};

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

        const data = {
            kod: String(method?.method_code || ''),
            ad: String(method?.name || ''),
            matriks: String(method?.matrix || ''),
            test: 'SİSTEM AKTİF - TEST BAŞARILI',

            // Keep template styling by sending plain text instead of raw editor HTML.
            s1: htmlToWordText(instruction?.["1.0"]),
            s2: htmlToWordText(instruction?.["2.0"]),
            s3: htmlToWordText(instruction?.["3.0"]),
            s3_1: htmlToWordText(instruction?.["3.1"]),
            s3_2: htmlToWordText(instruction?.["3.2"]),
            s3_3: htmlToWordText(instruction?.["3.3"]),
            s3_4: htmlToWordText(instruction?.["3.4"]),
            s3_5: htmlToWordText(instruction?.["3.5"]),
            s4: htmlToWordText(instruction?.["4.0"]),
            s5: htmlToWordText(instruction?.["5.0"]),
            s6: htmlToWordText(instruction?.["6.0"]),
            s7: htmlToWordText(instruction?.["7.0"]),
            s8: htmlToWordText(instruction?.["8.0"]),
            s9: htmlToWordText(instruction?.["9.0"]),

            // Plain text aliases for template fields.
            t1: htmlToWordText(instruction?.["1.0"]),
            t3_1: htmlToWordText(instruction?.["3.1"]),
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
