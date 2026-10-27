/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit, resumable migration. Never merges into existing laboratory tables.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
require('@next/env').loadEnvConfig(process.cwd());
const ROOT = path.resolve('outputs/neon-mysql-migration-2026-10-27');
const LOCK = 7261027;
const qi = s => '"' + s.replaceAll('"', '""') + '"';
const mi = s => '`' + s.replaceAll('`', '``') + '`';
const physical = (schema, name) => `ng_${schema}_${name}`;
const digest = rows => crypto.createHash('sha256').update(rows.sort().join('\n')).digest('hex');
const rowHash = row => crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
function canonical(v, c) {
  if (v == null) return null;
  if (c.udt_name === 'bytea') return Buffer.isBuffer(v) ? '\\x' + v.toString('hex') : v;
  if (c.udt_name === 'bool') return ['t', 'true', '1', 1, true].includes(v) ? '1' : '0';
  let s = String(v);
  if (['int2','int4','int8','numeric'].includes(c.udt_name)) {
    s = s.replace(/^(\+)|(?<=\.[0-9]*)0+$/g, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
  }
  if (['float4','float8'].includes(c.udt_name)) s = String(Number(Number(v).toPrecision(c.udt_name === 'float4' ? 7 : 15)));
  if (['timestamp','timestamptz','time'].includes(c.udt_name)) s = s.replace('T',' ').replace(/Z$/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/,'');
  return s;
}
function sourceSelect(t) {
  return t.columns.map(c => c.udt_name === 'timestamptz'
    ? `to_char(${qi(c.column_name)} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS ${qi(c.column_name)}`
    : `${qi(c.column_name)}::text AS ${qi(c.column_name)}`).join(',');
}
function dbValue(v,c) {
  if (v == null) return null;
  if (c.udt_name === 'bytea') return Buffer.from(v.slice(2), 'hex');
  if (c.udt_name === 'bool') return ['t','true','1',1,true].includes(v) ? 1 : 0;
  return v;
}
function mysqlType(c, keyCount) {
  const types = { int2:'SMALLINT',int4:'INT',int8:'BIGINT',bool:'TINYINT(1)',float4:'DOUBLE',float8:'DOUBLE',date:'DATE',timestamp:'DATETIME(6)',timestamptz:'DATETIME(6)',time:'TIME(6)',bytea:'LONGBLOB',uuid:'CHAR(36)' };
  if (types[c.udt_name]) return types[c.udt_name];
  if (c.udt_name === 'numeric') {
    if ((c.numeric_precision || 38) > 65 || (c.numeric_scale || 0) > 30) throw Error('Unsupported numeric precision: '+c.column_name);
    return `DECIMAL(${c.numeric_precision || 38},${c.numeric_scale || 0})`;
  }
  if (c.key) return `VARCHAR(${Math.min(c.character_maximum_length || (keyCount === 1 ? 700 : 191), keyCount === 1 ? 700 : 191)})`;
  if (c.character_maximum_length && c.character_maximum_length <= 255) return `VARCHAR(${c.character_maximum_length})`;
  if (['text','varchar','bpchar','json','jsonb','xml'].includes(c.udt_name) || c.data_type === 'ARRAY') return 'LONGTEXT';
  throw Error(`Unsupported PostgreSQL type ${c.udt_name} (${c.column_name})`);
}
function defaultSql(c, type) {
  const d=c.column_default;
  if (!d || /nextval\(/.test(d)) return '';
  if (/^(?:now\(\)|CURRENT_TIMESTAMP)$/i.test(d)) return ' DEFAULT CURRENT_TIMESTAMP(6)';
  if (/^(?:true|false)$/i.test(d)) return ` DEFAULT ${d === 'true' ? 1 : 0}`;
  const n=d.match(/^(-?[\d.]+)(?:::.*)?$/); if(n) return ` DEFAULT ${n[1]}`;
  const s=d.match(/^'((?:[^']|'')*)'(?:::.*)?$/s);
  if(s) return ' DEFAULT '+mysql.escape(s[1].replaceAll("''", "'"));
  if (/^NULL(?:::.*)?$/i.test(d)) return ' DEFAULT NULL';
  throw Error(`Unsupported default ${d} (${c.column_name}, ${type})`);
}
async function connect() {
  const pg=require('@vercel/postgres').createPool({connectionString:process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL});
  const my=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT || 3306),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true,charset:'utf8mb4_bin',timezone:'Z'});
  await my.query("SET time_zone = '+00:00'");
  const [[{ acquired }]]=await my.query("SELECT GET_LOCK('portal.neon-mysql-migration',0) AS acquired");
  if(Number(acquired)!==1){await my.end();await pg.end();throw Error('Another migration is already running');}
  const keepalive=setInterval(()=>{my.ping().catch(()=>{});},30000);keepalive.unref();
  my.on('end',()=>clearInterval(keepalive));
  return {pg,my};
}
async function inventory(pg) {
  const tables=(await pg.query("SELECT table_schema AS schema, table_name AS name FROM information_schema.tables WHERE table_schema IN ('dbo','cosmoroot','public') AND table_type='BASE TABLE' ORDER BY table_schema,table_name")).rows;
  const columns=(await pg.query("SELECT * FROM information_schema.columns WHERE table_schema IN ('dbo','cosmoroot','public') ORDER BY table_schema,table_name,ordinal_position")).rows;
  const keys=(await pg.query(`SELECT tc.table_schema,tc.table_name,k.column_name,k.ordinal_position FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage k ON k.constraint_schema=tc.constraint_schema AND k.constraint_name=tc.constraint_name AND k.table_name=tc.table_name WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema IN ('dbo','cosmoroot','public') ORDER BY tc.table_schema,tc.table_name,k.ordinal_position`)).rows;
  return tables.map(t=> {
    if (physical(t.schema,t.name).length>64) throw Error('Identifier exceeds MySQL limit');
    const pk=keys.filter(k=>k.table_schema===t.schema&&k.table_name===t.name).map(k=>k.column_name);
    return {...t,target:physical(t.schema,t.name),pk,columns:columns.filter(c=>c.table_schema===t.schema&&c.table_name===t.name).map(c=>({...c,key:pk.includes(c.column_name)}))};
  });
}
async function control(my) {
  await my.query(`CREATE TABLE IF NOT EXISTS NeonMigrationControl (ID INT PRIMARY KEY, Backend VARCHAR(12) NOT NULL, RuntimeVersion INT NOT NULL DEFAULT 0, ProductionSeenAt DATETIME(6) NULL, UpdatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB`);
  await my.query("INSERT IGNORE INTO NeonMigrationControl (ID,Backend) VALUES (1,'postgres')");
  const [r]=await my.query('SELECT * FROM NeonMigrationControl WHERE ID=1');return r[0];
}
async function capture(pg,tables) {
  await pg.query('CREATE SCHEMA IF NOT EXISTS portal_migration');
  await pg.query('CREATE TABLE IF NOT EXISTS portal_migration.control (id integer PRIMARY KEY, fenced boolean NOT NULL DEFAULT false)');
  await pg.query('INSERT INTO portal_migration.control (id) VALUES (1) ON CONFLICT DO NOTHING');
  const state=await pg.query('SELECT fenced FROM portal_migration.control WHERE id=1');
  if(state.rows[0].fenced) throw Error('Source already fenced; do not rerun prepare');
  await pg.query('CREATE TABLE IF NOT EXISTS portal_migration.changes (id bigserial PRIMARY KEY, schema_name text NOT NULL, table_name text NOT NULL, old_row jsonb, new_row jsonb)');
  await pg.query(`CREATE OR REPLACE FUNCTION portal_migration.capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    PERFORM pg_advisory_xact_lock_shared(${LOCK});
    IF (SELECT fenced FROM portal_migration.control WHERE id=1) THEN RAISE EXCEPTION 'Portal moved to MySQL; retry request' USING ERRCODE='P7501'; END IF;
    INSERT INTO portal_migration.changes(schema_name,table_name,old_row,new_row) VALUES (TG_TABLE_SCHEMA,TG_TABLE_NAME,CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
    RETURN NULL;
  END $$`);
  for(const t of tables) {
    const present=await pg.query('SELECT 1 FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname=$2', [`${qi(t.schema)}.${qi(t.name)}`,'portal_mysql_capture']);
    if(!present.rows.length) await pg.query(`CREATE TRIGGER portal_mysql_capture AFTER INSERT OR UPDATE OR DELETE ON ${qi(t.schema)}.${qi(t.name)} FOR EACH ROW EXECUTE FUNCTION portal_migration.capture()`);
  }
}
async function exportTable(client,t,suffix="") {
  const out=fs.openSync(path.join(ROOT,t.target+suffix+'.ndjson'),'w');
  const hashes=[];let count=0;
  await client.query(`DECLARE migration_rows NO SCROLL CURSOR FOR SELECT ${sourceSelect(t)} FROM ${qi(t.schema)}.${qi(t.name)}`);
  try {
    while(true) {
      const {rows}=await client.query('FETCH 1000 FROM migration_rows'); if(!rows.length)break;
      for(const row of rows){const vals=t.columns.map(c=>row[c.column_name]);fs.writeSync(out,JSON.stringify(vals)+'\n');hashes.push(rowHash(vals.map((v,i)=>canonical(v,t.columns[i]))));count++;}
    }
  } finally {fs.closeSync(out);await client.query('CLOSE migration_rows');}
  t.count=count;t.sha256=digest(hashes);console.log(`SNAPSHOT ${t.schema}.${t.name}: ${count}`);
}
async function createTarget(my,t) {
  const definitions=t.columns.map(c=> {
    const type=mysqlType(c,t.pk.length);
    const identity=/nextval\(/.test(c.column_default||'');
    return `${mi(c.column_name)} ${type} ${c.is_nullable==='NO'?'NOT NULL':'NULL'}${identity?' AUTO_INCREMENT':defaultSql(c,type)}`;
  });
  if(t.pk.length)definitions.push(`PRIMARY KEY (${t.pk.map(mi).join(',')})`);
  for(const c of t.columns) if(/nextval\(/.test(c.column_default||'') && t.pk[0]!==c.column_name) definitions.push(`INDEX ${mi('ix_identity_'+c.column_name)} (${mi(c.column_name)})`);
  await my.query(`CREATE TABLE ${mi(t.target)} (${definitions.join(',')}) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
  // Important reference lookups receive indexes even on legacy tables without FKs.
  for(const c of t.columns) if(!c.key && /^(?:UrunID|HammaddeID|cID|FirmaID|RecordID|RaporID|NkrID|TeklifID)$/i.test(c.column_name)) await my.query(`CREATE INDEX ${mi('ix_'+c.column_name)} ON ${mi(t.target)} (${mi(c.column_name)}${/TEXT/.test(mysqlType(c,t.pk.length))?'(191)':''})`);
}
async function importTable(my,t,suffix="") {
  console.log('IMPORT '+t.target);
  const readline=require('node:readline');
  const columns=t.columns.map(c=>mi(c.column_name)).join(',');let batch=[],bytes=0;
  async function flush(){if(!batch.length)return;await my.query(`INSERT INTO ${mi(t.target)} (${columns}) VALUES ?`,[batch]);batch=[];bytes=0;}
  await my.beginTransaction();
  const input=readline.createInterface({input:fs.createReadStream(path.join(ROOT,t.target+suffix+'.ndjson')),crlfDelay:Infinity});
  try{for await(const line of input){const row=JSON.parse(line);batch.push(row.map((v,i)=>dbValue(v,t.columns[i])));bytes+=line.length;if(batch.length>=500||bytes>1_000_000)await flush();}await flush();await my.commit();}catch(e){await my.rollback();throw e;}
}
async function verify(my,t) {
  const hashes=[];let offset=0;
  while(true){const [rows]=await my.query(`SELECT ${t.columns.map(c=>mi(c.column_name)).join(',')} FROM ${mi(t.target)} LIMIT 1000 OFFSET ${offset}`);if(!rows.length)break;for(const row of rows) hashes.push(rowHash(t.columns.map(c=>canonical(row[c.column_name],c))));offset+=rows.length;}
  if(offset!==t.count||digest(hashes)!==t.sha256) throw Error('Row/hash mismatch '+t.target+` (${offset}/${t.count})`);
  console.log(`VERIFIED ${t.target}: ${offset}`);
}
async function constraints(pg,my,tables) {
  const rows=(await pg.query(`SELECT n.nspname AS schema,c.relname AS name,k.conname,k.contype,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('dbo','cosmoroot','public') AND k.contype IN ('f','u','c') ORDER BY k.contype DESC,n.nspname,c.relname`)).rows;
  fs.writeFileSync(path.join(ROOT,'constraints.json'),JSON.stringify(rows,null,2));
  for(const r of rows) {
    const t=tables.find(t=>t.schema===r.schema&&t.name===r.name);if(!t)throw Error('Constraint table missing');
    const constraintName='ng_'+r.conname;
    const [[{n}]]=await my.query('SELECT COUNT(*) n FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name=? AND constraint_name=?',[t.target,constraintName]);
    if(Number(n))continue;
    if(r.contype==='u') {
      const cols=[...r.definition.matchAll(/"([^\"]+)"/g)].map(m=>m[1]);
      if(!cols.length)throw Error('Unsupported unique constraint '+r.definition);
      for(const col of cols){const c=t.columns.find(c=>c.column_name===col);if(/TEXT/.test(mysqlType(c,t.pk.length))){const [[{max}]]=await my.query(`SELECT MAX(CHAR_LENGTH(${mi(col)})) AS max FROM ${mi(t.target)}`);if(Number(max)>191)throw Error('Unique key exceeds safe length '+t.target+'.'+col);await my.query(`ALTER TABLE ${mi(t.target)} MODIFY ${mi(col)} VARCHAR(191) ${c.is_nullable==='NO'?'NOT NULL':'NULL'}${defaultSql(c,'VARCHAR(191)')}`);}}
      await my.query(`ALTER TABLE ${mi(t.target)} ADD CONSTRAINT ${mi(constraintName)} UNIQUE (${cols.map(mi).join(',')})`);
    } else if(r.contype==='f') {
      const f=r.definition.match(/^FOREIGN KEY \(([^)]+)\) REFERENCES (?:(\w+)\.)?"?(\w+)"?\(([^)]+)\)(.*)$/);
      if(!f)throw Error('Unsupported FK '+r.definition);
      const ref=tables.find(x=>x.schema===(f[2]||'public')&&x.name===f[3]);if(!ref)throw Error('FK target missing');
      const cols=f[1].replaceAll('"','').split(',').map(s=>s.trim()),refs=f[4].replaceAll('"','').split(',').map(s=>s.trim());
      await my.query(`ALTER TABLE ${mi(t.target)} ADD CONSTRAINT ${mi(constraintName)} FOREIGN KEY (${cols.map(mi)}) REFERENCES ${mi(ref.target)} (${refs.map(mi)}) ${f[5]}`);
    } else throw Error('Check constraint needs explicit translation '+r.definition);
  }
}
async function sequences(pg,my,tables) {
  const report=[];
  for(const t of tables)for(const c of t.columns)if(/nextval\(/.test(c.column_default||'')) {
    const seq=(await pg.query('SELECT pg_get_serial_sequence($1,$2) AS name',[`${qi(t.schema)}.${qi(t.name)}`,c.column_name])).rows[0]?.name
      || c.column_default.match(/nextval\('((?:[^']|'')+)'::regclass\)/)?.[1].replaceAll("''", "'");
    if(!seq)throw Error('Sequence not found '+t.target+'.'+c.column_name);
    const increment=(await pg.query('SELECT seqincrement::text AS n FROM pg_sequence WHERE seqrelid=$1::regclass',[seq])).rows[0]?.n;
    if(increment!=='1')throw Error('Non-unit sequence needs explicit mapping '+seq);
    const v=(await pg.query(`SELECT last_value::text AS value,is_called FROM ${seq}`)).rows[0];
    const next=BigInt(v.value)+(v.is_called?1n:0n);
    await my.query(`ALTER TABLE ${mi(t.target)} AUTO_INCREMENT = ${next}`);
    report.push({table:t.target,column:c.column_name,next:String(next)});
  }
  fs.writeFileSync(path.join(ROOT,'sequences.json'),JSON.stringify(report,null,2));
}
async function prepare(pg,my) {
  const state=await control(my);if(state.Backend!=='postgres')throw Error('MySQL already active; source import forbidden');
  fs.mkdirSync(ROOT,{recursive:true});
  if(fs.existsSync(path.join(ROOT,'manifest.json')))throw Error('Snapshot exists; use resume, never overwrite backup');
  const tables=await inventory(pg);
  // Validate every type/default before any source triggers or target tables are installed.
  for(const t of tables)for(const c of t.columns)defaultSql(c,mysqlType(c,t.pk.length));
  const [existing]=await my.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE 'ng\\_%'");
  if(existing.length)throw Error('Reserved target namespace is occupied; review before proceeding');
  await capture(pg,tables);
  const client=await pg.connect();
  // Replay all captured transactions, including transactions still uncommitted at snapshot start.
  try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const start='0';
    for(const t of tables)await exportTable(client,t);
    fs.writeFileSync(path.join(ROOT,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),changeStart:start,tables},null,2));
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  await resume(my,pg);
}
async function resume(my,pg) {
  const state=await control(my);if(state.Backend!=='postgres')throw Error('Cannot import after activation');
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json'),'utf8'));
  const repair=process.argv.find(arg=>arg.startsWith('--repair='))?.slice(9);
  if(repair){const t=manifest.tables.find(t=>t.target===repair);if(!t||!repair.startsWith('ng_'))throw Error('Repair target is outside migration namespace');await my.query(`DELETE FROM ${mi(t.target)}`);}
  for(const t of manifest.tables){const [present]=await my.query('SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?',[t.target]);
    if(!present.length)await createTarget(my,t);
    const [[{n}]]=await my.query(`SELECT COUNT(*) n FROM ${mi(t.target)}`);
    if(Number(n)===0&&t.count)await importTable(my,t);
    await verify(my,t);
  }
  if(pg)await constraints(pg,my,manifest.tables);
  fs.writeFileSync(path.join(ROOT,'prepared.json'),JSON.stringify({at:new Date().toISOString(),tables:manifest.tables.length}));
  // Runtime mapping contains schema only, never source rows or credentials.
  fs.writeFileSync('lib/neonMysqlTables.json',JSON.stringify(manifest.tables.map(t=>({schema:t.schema,name:t.name,target:t.target,columns:t.columns.map(c=>c.column_name)})),null,2)+'\n');
}
async function sync(pg,my,{activate=false}={}) {
  if(!fs.existsSync(path.join(ROOT,'prepared.json')))throw Error('Baseline not verified');
  const state=await control(my);if(state.Backend!=='postgres')throw Error('Target already active; reverse sync is prohibited');
  if(activate && (!state.ProductionSeenAt || state.RuntimeVersion!==2 || Date.now()-new Date(state.ProductionSeenAt+'Z').getTime()>180000))throw Error('Production migration-aware runtime has not checked in recently');
  const m=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json'),'utf8'));
  const client=await pg.connect();let fenced=false,activated=false;
  try {
    if(activate){await client.query('BEGIN');await client.query(`SELECT pg_advisory_xact_lock(${LOCK})`);await client.query('UPDATE portal_migration.control SET fenced=true WHERE id=1');await client.query('COMMIT');fenced=true;}
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const changes=(await client.query('SELECT schema_name,table_name,old_row,new_row FROM portal_migration.changes WHERE id > $1 ORDER BY id',[m.changeStart])).rows;
    const affected=new Map();for(const change of changes){const t=m.tables.find(t=>t.schema===change.schema_name&&t.name===change.table_name);if(t)affected.set(t.target,t);}
    await my.query('SET FOREIGN_KEY_CHECKS=0');
    for(const t of affected.values()) {
      // Reconcile a changed table in a transaction. Source originals and current lab tables are untouched.
      const suffix=".sync-"+Date.now();
      await exportTable(client,t,suffix);
      await my.beginTransaction();try{await my.query(`DELETE FROM ${mi(t.target)}`);await my.commit();}catch(e){await my.rollback();throw e;}
      await importTable(my,t,suffix);await verify(my,t);
    }
    await my.query('SET FOREIGN_KEY_CHECKS=1');
    // Verify source row counts; unchanged-table hash came from the consistent snapshot + CDC.
    for(const t of m.tables){const r=await client.query(`SELECT COUNT(*)::text AS n FROM ${qi(t.schema)}.${qi(t.name)}`);if(Number(r.rows[0].n)!==t.count)throw Error('Source changed without capture: '+t.target);}
    await client.query('COMMIT');
    if(activate)await sequences(pg,my,m.tables);
    if(activate){await my.query("UPDATE NeonMigrationControl SET Backend='mysql',UpdatedAt=NOW(6) WHERE ID=1 AND Backend='postgres'");activated=true;}
    fs.writeFileSync(path.join(ROOT,activate?'activated.json':'synced.json'),JSON.stringify({at:new Date().toISOString(),changedTables:[...affected.keys()],capturedChanges:changes.length,tables:m.tables.length}));
    console.log(activate?'ACTIVATED MYSQL; PostgreSQL originals fenced and retained':'SYNC VERIFIED');
  }catch(e){try{await client.query('ROLLBACK');}catch{} if(fenced&&!activated){await client.query('UPDATE portal_migration.control SET fenced=false WHERE id=1');}throw e;}finally{await my.query('SET FOREIGN_KEY_CHECKS=1');client.release();}
}
async function main(){const mode=process.argv[2];if(!['prepare','resume','sync','activate'].includes(mode))throw Error('Usage: node scripts/neon-mysql-migration.cjs prepare|resume|sync|activate');const {pg,my}=await connect();try{if(mode==='prepare')await prepare(pg,my);if(mode==='resume')await resume(my,pg);if(mode==='sync'||mode==='activate')await sync(pg,my,{activate:mode==='activate'});}finally{await my.end();await pg.end();}}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={physical,canonical,mysqlType,defaultSql};
