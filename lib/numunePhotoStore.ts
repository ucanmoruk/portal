import { createPool } from "@vercel/postgres";
import { isNeonMigrated, migrationMysqlPool, waitForNeonCutover } from "./neonMigrationState";
let pg: ReturnType<typeof createPool> | undefined;
function source() { return pg ??= createPool({ connectionString: process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL }); }
export async function ensureNumunePhotoStore() {
  if (await isNeonMigrated()) return;
  await source().query(`CREATE TABLE IF NOT EXISTS "NumuneFotoBlob" (
    "RaporID" integer PRIMARY KEY, "FotoData" bytea NOT NULL,
    "MimeType" text NOT NULL DEFAULT 'image/jpeg', "UpdatedAt" timestamptz NOT NULL DEFAULT now())`);
}
export async function readNumunePhoto(id: number): Promise<{ FotoData?: Buffer; MimeType?: string } | undefined> {
  if (await isNeonMigrated()) {
    const [rows] = await migrationMysqlPool().query("SELECT FotoData, MimeType FROM ng_public_NumuneFotoBlob WHERE RaporID=?", [id]);
    return (rows as { FotoData?: Buffer; MimeType?: string }[])[0];
  }
  return (await source().query('SELECT "FotoData", "MimeType" FROM "NumuneFotoBlob" WHERE "RaporID"=$1', [id])).rows[0];
}
export async function saveNumunePhoto(id: number, data: Buffer, mime: string) {
  if (await isNeonMigrated()) {
    await migrationMysqlPool().query(`INSERT INTO ng_public_NumuneFotoBlob (RaporID,FotoData,MimeType,UpdatedAt) VALUES (?,?,?,UTC_TIMESTAMP(6))
      ON DUPLICATE KEY UPDATE FotoData=VALUES(FotoData),MimeType=VALUES(MimeType),UpdatedAt=VALUES(UpdatedAt)`, [id,data,mime]);
    return;
  }
  try {
    await source().query(`INSERT INTO "NumuneFotoBlob" ("RaporID","FotoData","MimeType","UpdatedAt") VALUES ($1,$2,$3,now())
      ON CONFLICT ("RaporID") DO UPDATE SET "FotoData"=EXCLUDED."FotoData","MimeType"=EXCLUDED."MimeType","UpdatedAt"=now()`, [id,data,mime]);
  } catch(error) {
    if((error as {code?:string}).code !== 'P7501') throw error;
    await waitForNeonCutover();
    await saveNumunePhoto(id,data,mime);
  }
}
