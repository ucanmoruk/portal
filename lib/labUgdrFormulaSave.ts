import { z } from "zod";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

const amount = z.union([z.string().max(100), z.number()]);
export const LabFormulaInput = z.object({ rows: z.array(z.object({
  cosingId: z.number().int().positive().nullable().optional(), HammaddeID: z.number().int().positive().nullable().optional(),
  INCIName: z.string().max(500).nullable().optional(), inputName: z.string().max(500).optional(),
  inputAmount: amount.optional(), miktar: amount.optional(), Miktar: amount.optional(),
  dap: z.number().finite().nullable().optional(), DaP: z.number().finite().nullable().optional(),
  noael: amount.nullable().optional(), Noael: amount.nullable().optional(),
})).max(250) });
let ready: Promise<unknown> | null = null;

export async function saveLabFormula(pool: Awaited<typeof cosmoPool>, nkrId: number, rows: z.infer<typeof LabFormulaInput>["rows"]) {
  if (!ready) ready = pool.request().query(hasMysqlConfig()
    ? "CREATE TABLE IF NOT EXISTS NKR_RaporDurumOverride (NkrID INT NOT NULL,RaporFormati VARCHAR(100) NOT NULL,Durum VARCHAR(50) NOT NULL,UpdatedAt DATETIME NOT NULL,PRIMARY KEY(NkrID,RaporFormati)) CHARACTER SET utf8mb4"
    : "IF OBJECT_ID('NKR_RaporDurumOverride','U') IS NULL CREATE TABLE NKR_RaporDurumOverride (NkrID INT NOT NULL,RaporFormati NVARCHAR(100) NOT NULL,Durum NVARCHAR(50) NOT NULL,UpdatedAt DATETIME NOT NULL,PRIMARY KEY(NkrID,RaporFormati))"
  ).catch(error => { ready = null; throw error; });
  await ready;
  const tx = await pool.transaction(); await tx.begin();
  try {
    const locked = await tx.request().input("ID", nkrId).query(hasMysqlConfig()
      ? "SELECT ID FROM NKR WHERE ID=@ID FOR UPDATE" : "SELECT ID FROM NKR WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID");
    if (!locked.recordset.length) throw new Error("Formülün numune kaydı bulunamadı.");
    await tx.request().input("ID", nkrId).query("DELETE FROM NKR_Formul WHERE NKRID=@ID");
    for (let offset = 0; offset < rows.length; offset += 100) {
      const request = tx.request().input("ID", nkrId);
      const values = rows.slice(offset, offset + 100).map((row, i) => {
        request.input(`h${i}`, row.cosingId ?? row.HammaddeID ?? null).input(`n${i}`, row.INCIName ?? row.inputName ?? "")
          .input(`m${i}`, String(row.inputAmount ?? row.miktar ?? row.Miktar ?? "0")).input(`d${i}`, row.dap ?? row.DaP ?? 100)
          .input(`a${i}`, row.noael == null && row.Noael == null ? null : String(row.noael ?? row.Noael));
        return `(@ID,@h${i},@n${i},@m${i},@d${i},@a${i})`;
      });
      await request.query(`INSERT INTO NKR_Formul (NKRID,HammaddeID,INCIName,Miktar,DaP,Noael) VALUES ${values.join(",")}`);
    }
    await tx.request().input("ID", nkrId).input("Format", "ÜGDR").query("DELETE FROM NKR_RaporDurumOverride WHERE NkrID=@ID AND UPPER(REPLACE(RaporFormati,N'Ü',N'U'))=UPPER(REPLACE(@Format,N'Ü',N'U'))");
    await tx.request().input("ID", nkrId).input("Format", "ÜGDR").input("Status", "Devam Ediyor")
      .query("INSERT INTO NKR_RaporDurumOverride (NkrID,RaporFormati,Durum,UpdatedAt) VALUES (@ID,@Format,@Status,GETDATE())");
    await tx.commit();
  } catch (error) { await tx.rollback().catch(() => {}); throw error; }
}
