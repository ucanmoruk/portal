import tables from "./neonMysqlTables.json";
import { MysqlCompatPool } from "./mysqlCompat";

type Table = typeof tables[number];
const byName = new Map<string, Table>();
for (const schema of ["public", "cosmoroot", "dbo"]) for (const table of tables) if (table.schema === schema) byName.set(table.name.toLowerCase(), table);
const qualified = new Map(tables.map(t => [`${t.schema}.${t.name}`.toLowerCase(), t]));
const unquote = (s: string) => s.replace(/^[`"\[]|[`"\]]$/g, "");
const ident = '(?:`[^`]+`|"[^"]+"|\\[[^\\]]+\\]|[\\p{L}_][\\p{L}\\p{N}_]*)';
const refs = new RegExp(`(\\b(?:FROM|JOIN|UPDATE|INTO|REFERENCES|TABLE)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?)(${ident})(?:\\s*\\.\\s*(${ident}))?`, "giu");

/** Identifier rewriting only, retaining quoted strings, SQL comments and distinct source schemas. */
export function rewriteNeonSql(sql: string): string {
  return sql.split(/('(?:[^']|'')*'|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)/g).map((part, index) => {
    if (index % 2) return part;
    return part.replace(refs, (match, prefix: string, first: string, second: string | undefined, offset: number, input: string) => {
      // In an upsert UPDATE is followed by a column assignment, not a table.
      if (/\bUPDATE\s+$/i.test(prefix) && /^\s*=/.test(input.slice(offset + match.length))) return match;
      const a=unquote(first), b=second ? unquote(second) : undefined;
      if (/^(?:information_schema|sys|tempdb)$/i.test(a)) return match;
      if (a.startsWith("ng_") || a.startsWith("#")) return match;
      const table = b ? qualified.get(`${a}.${b}`.toLowerCase()) : byName.get(a.toLowerCase());
      if (table) return `${prefix}\`${table.target}\``;
      // Derived tables/CTEs may be read, but an unknown write must never hit a laboratory table.
      if (/\b(?:UPDATE|INTO|TABLE|REFERENCES)\s/i.test(prefix)) throw new Error(`Neon/MySQL tablo eşlemesi bulunamadı: ${a}${b ? '.'+b : ''}`);
      return match;
    });
  }).join("").replace(/((?:TABLE_NAME|table_name)\s*=\s*N?)'([^']+)'/gi, (m, prefix: string, name: string) => {
    const table=byName.get(name.toLowerCase()); return table ? `${prefix}'${table.target}'` : m;
  });
}

const canonicalColumns=new Map<string,string>();
for(const t of tables) for(const col of t.columns) if(!canonicalColumns.has(col.toLowerCase()) || col !== col.toLowerCase()) canonicalColumns.set(col.toLowerCase(),col);
export const neonMysqlPool = new MysqlCompatPool({ prepareSql: rewriteNeonSql, normalizeRows: rows => rows.map(row => {
  const result = {...row};
  for(const [key,value] of Object.entries(row)) { result[key.toUpperCase()] ??= value; const canonical=canonicalColumns.get(key.toLowerCase()); if(canonical && !(canonical in result)) result[canonical]=value; }
  return result;
}) });

const financeColumns: Record<string,string> = { ID:'id',Ad:'ad',Durum:'durum',CreatedAt:'created_at',UpdatedAt:'updated_at',FirmaID:'firma_id',FirmaAd:'firma_ad',Tur:'tur',Baslik:'baslik',Tutar:'tutar',OdenenTutar:'odenen_tutar',ParaBirimi:'para_birimi',VadeTarihi:'vade_tarihi',TaksitNo:'taksit_no',TaksitToplam:'taksit_toplam',Tekrar:'tekrar',OtomatikOdeme:'otomatik_odeme',BildirimTarihi:'bildirim_tarihi',BildirimSaati:'bildirim_saati',OdemeTarihi:'odeme_tarihi',Notlar:'notlar',KayitID:'kayit_id' };
export function rewriteNeonFinanceSql(sql:string) {
  const names: Record<string,string>={PortalFinansFirma:'ng_public_portal_finans_firma',PortalFinansKayit:'ng_public_portal_finans_kayit',PortalFinansOdeme:'ng_public_portal_finans_odeme',...financeColumns};
  return sql.split(/('(?:[^']|'')*')/g).map((part,index)=>index%2 ? part : part.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, name => names[name] || name)).join('');
}
