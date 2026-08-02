import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

const ADMIN_USER_IDS = new Set(["2"]);
const MAX_ROWS = 100;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const ALLOWED_TABLES = new Set([
  "Firma",
  "NKR",
  "NumuneX1",
  "StokAnalizListesi",
  "Fatura",
  "FaturaDetay",
  "ProformaBaslik",
  "TeklifBaslik",
]);

type SessionLike = { user?: { userId?: string | number | null } };
type OpenAIContent = { text?: string };
type OpenAIOutput = { content?: OpenAIContent[] };

const SCHEMA_HINT = `
MySQL/MariaDB database. Only generate read-only SELECT queries.
Allowed tables and useful columns:
- Firma(ID, Firma_Adi, Adres, Mail, Telefon, Durum)
- NKR(ID, Evrak_No, RaporNo, Tarih, TerminTarihi, KabulTarihi, Numune_Adi, Firma_ID, Durum, Rapor_Durumu, RaporTuru)
- NumuneX1(ID, RaporID, AnalizID, Durum)
- StokAnalizListesi(ID, Kod, Ad, RaporFormati, Bolum, Durum)
- Fatura(ID, Fatura_No, ProformaNo, Tarih, Toplam, Tutar, KDV, Odenen_Tutar, FaturaFirmaID, Durum)
- FaturaDetay(ID, ProformaNo, Tarih)
- ProformaBaslik(ID, ProformaNo, EvrakNo, FirmaID, FaturaFirmaID, Tarih, GenelToplam, Durum, SilindiMi)
- TeklifBaslik(ID, TeklifNo, FirmaID, Tarih, GenelToplam, TeklifDurum, SilindiMi)
Common joins:
- NKR.Firma_ID = Firma.ID
- NumuneX1.RaporID = NKR.ID
- NumuneX1.AnalizID = StokAnalizListesi.ID
- Fatura.FaturaFirmaID = Firma.ID
- ProformaBaslik.FirmaID = Firma.ID
Use Turkish collation-friendly LIKE with LOWER(...) when searching text.
For dates use YEAR(date_col), MONTH(date_col), CURDATE(), DATE_SUB.
Return compact aggregate queries when possible.
`;

function isAdmin(session: SessionLike) {
  const userId = String(session?.user?.userId || "");
  return ADMIN_USER_IDS.has(userId);
}

function extractOutputText(data: unknown): string {
  const root = data as { output_text?: unknown; output?: OpenAIOutput[] };
  if (typeof root?.output_text === "string") return root.output_text;
  const parts: string[] = [];
  for (const item of root?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function parseJsonText(text: string) {
  const clean = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(clean);
}

async function callOpenAI(input: unknown, jsonSchema?: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY tanimli degil. Veri Asistani icin .env dosyasina OPENAI_API_KEY eklenmeli.");
  }

  const body: Record<string, unknown> = {
    model: MODEL,
    input,
  };
  if (jsonSchema) {
    body.text = {
      format: {
        type: "json_schema",
        name: "veri_asistani_sql",
        strict: true,
        schema: jsonSchema,
      },
    };
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data?.error?.message || "OpenAI yaniti alinamadi.");
  }
  return extractOutputText(data);
}

function validateAndLimitSql(rawSql: string) {
  let sql = String(rawSql || "").trim();
  sql = sql.replace(/;+\s*$/g, "").trim();

  if (!/^(select|with)\b/i.test(sql)) {
    throw new Error("Sadece SELECT/WITH sorgularina izin verilir.");
  }
  if (sql.includes(";")) {
    throw new Error("Tek istekte birden fazla SQL komutu calistirilamaz.");
  }
  if (/(insert|update|delete|alter|drop|truncate|create|replace|grant|revoke|call|exec|set)\b/i.test(sql)) {
    throw new Error("Yazma veya yonetim komutlari engellendi.");
  }
  if (/--|\/\*/.test(sql)) {
    throw new Error("SQL yorumlari kullanilamaz.");
  }

  const tables = [...sql.matchAll(/\b(?:from|join)\s+`?([A-Za-z_][A-Za-z0-9_]*)`?/gi)].map((m) => m[1]);
  for (const table of tables) {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`Bu tabloya izin yok: ${table}`);
    }
  }

  const limitMatch = sql.match(/\blimit\s+(\d+)/i);
  if (!limitMatch) {
    sql += ` LIMIT ${MAX_ROWS}`;
  } else if (Number(limitMatch[1]) > MAX_ROWS) {
    sql = sql.replace(/\blimit\s+\d+/i, `LIMIT ${MAX_ROWS}`);
  }
  return sql;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erisim" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Bu alan sadece admin kullaniciya acik." }, { status: 403 });

  try {
    const body = await request.json();
    const question = String(body.question || "").trim();
    if (question.length < 3) return Response.json({ error: "Soru bos olamaz." }, { status: 400 });
    if (question.length > 1000) return Response.json({ error: "Soru cok uzun." }, { status: 400 });

    const planText = await callOpenAI([
      {
        role: "system",
        content: `You are a read-only MySQL analyst. Generate one SQL query only. ${SCHEMA_HINT}`,
      },
      {
        role: "user",
        content: question,
      },
    ], {
      type: "object",
      additionalProperties: false,
      properties: {
        sql: { type: "string" },
        note: { type: "string" },
      },
      required: ["sql", "note"],
    });

    const plan = parseJsonText(planText) as { sql?: unknown; note?: unknown };
    const sql = validateAndLimitSql(String(plan.sql || ""));

    const pool = await cosmoPool;
    const result = await pool.request().query(sql);
    const rows = (result.recordset || []).slice(0, MAX_ROWS);

    const answer = await callOpenAI([
      {
        role: "system",
        content: "Cevabi sadece verilen SQL sonucu satirlarina gore Turkce ve kisa yaz. Veride yoksa bilmiyorum de. Yeni veri uydurma.",
      },
      {
        role: "user",
        content: JSON.stringify({ question, sql, rows }),
      },
    ]);

    return Response.json({
      answer,
      sql,
      rows,
      rowCount: rows.length,
      note: typeof plan.note === "string" ? plan.note : "",
    });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Veri Asistani calisamadi." }, { status: 500 });
  }
}
