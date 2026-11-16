/* Read-only by default. --apply inserts one audited transaction; existing records are never overwritten. */
/* eslint-disable @typescript-eslint/no-require-imports */
require('./register-local-ts.cjs');
const fs=require('node:fs'),path=require('node:path'),xlsx=require('xlsx');
const {cosmoPool}=require('../lib/db.ts');
const {ensureWorkspaceSchema}=require('../lib/kysWorkspaceStore.ts');
const {planDeviceImport,deviceImportId}=require('../lib/kysDeviceImport.ts');
async function readLegacy(pool){const [c,b,k,i]=await Promise.all([
 pool.request().query(`SELECT c.*, b.Birim, f.Ad AS Tedarikci, d.Ad AS Talimat FROM CihazListesi c LEFT JOIN StokFirmaBirim b ON b.ID=c.BirimID LEFT JOIN StokTedarikci f ON f.ID=c.FirmaID LEFT JOIN DokumanMaster d ON d.ID=c.TalimatID ORDER BY c.ID`),
 pool.request().query('SELECT * FROM CihazBakim ORDER BY ID'),
 pool.request().query(`SELECT k.*,CONCAT(COALESCE(d.Kod,''),' ',COALESCE(d.Ad,'')) AS KaynakAdi FROM CihazKalibrasyon k LEFT JOIN StokDKDListe d ON d.ID=k.Kaynak ORDER BY k.ID`),
 pool.request().query(`SELECT i.*,CASE WHEN i.Finout='i' THEN CONCAT(COALESCE(p.Ad,''),' ',COALESCE(p.Soyad,'')) ELSE f.Ad END AS Uygulayan FROM CihazIslem i LEFT JOIN StokTedarikci f ON f.ID=i.FirmaID LEFT JOIN StokKullanici p ON p.ID=i.PersonelID ORDER BY i.ID`)]);
 return {cihazlar:c.recordset,bakimlar:b.recordset,kalibrasyonlar:k.recordset,islemler:i.recordset};}
async function main(){
 const source=process.argv.find(v=>v.endsWith('.xlsx'));if(!source)throw Error('CihazListesi.xlsx dosyasının tam yolunu verin.');
 const book=xlsx.readFile(source);const rows=xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:''});
 const pool=await cosmoPool,legacy=await readLegacy(pool);
 const existing=(await pool.request().query('SELECT Payload FROM KysWorkspaceRecord')).recordset.map(r=>JSON.parse(r.Payload));
 const plan=planDeviceImport(legacy,rows,existing);
 const dir=path.resolve('outputs/device-import-2026-11-17');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify(plan,null,2));
 console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'preview',insert:plan.records.length,skipped:plan.skipped,counts:plan.counts,excludedDevices:plan.excludedDevices}));
 if(!process.argv.includes('--apply'))return;
 await ensureWorkspaceSchema();
 const tx=await pool.transaction();await tx.begin();
 try {
  const locked=(await tx.request().query('SELECT Payload FROM KysWorkspaceRecord FOR UPDATE')).recordset.map(r=>JSON.parse(r.Payload));
  const final=planDeviceImport(legacy,rows,locked);
  fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify(locked,null,2));
  for(const record of final.records){
   await tx.request().input('ID',record.id).input('Module',record.module).input('Code',record.module==='cihaz-listesi'?record.data.code:null).input('Version',record.version).input('Payload',JSON.stringify(record)).query('INSERT INTO KysWorkspaceRecord (ID,Module,Code,Version,Payload) VALUES (@ID,@Module,@Code,@Version,@Payload)');
   const audit={id:deviceImportId('CihazAktarimAudit',record.source.id+(record.module==='cihaz-listesi'?1000000:record.module==='cihaz-bakim-sartlari'?2000000:record.module==='cihaz-kalibrasyon-sartname'?3000000:4000000)),recordId:record.id,actor:'Eski sistem aktarımı',at:record.createdAt,action:'SQL cihaz prosedürü aktarımı',before:null,after:record};
   await tx.request().input('ID',audit.id).input('RecordID',record.id).input('Payload',JSON.stringify(audit)).query('INSERT INTO KysWorkspaceAudit (ID,RecordID,Payload) VALUES (@ID,@RecordID,@Payload)');
  }
  await tx.commit();fs.writeFileSync(path.join(dir,'applied.json'),JSON.stringify({at:new Date().toISOString(),inserted:final.records.length,ids:final.records.map(r=>r.id)},null,2));console.log('COMMITTED',final.records.length);
 }catch(e){await tx.rollback();throw e;}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
