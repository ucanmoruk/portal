import mysql from "mysql2/promise";
import { createHash } from "node:crypto";

// Only reference columns are changed. Full before/after rows are stored for
// guarded rollback; invoice/payment status, amounts and company IDs are immutable.
const mode = process.argv[2] || "audit";
if (!["audit", "apply", "rollback"].includes(mode)) throw new Error("audit | apply | rollback");
const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE, charset: "utf8mb4", dateStrings: true,
});
const backupTable = "CommercialEvrakRepair20260916";
const allowed = { Fatura: ["ProformaNo"], FaturaDetay: ["ProformaNo"], ProformaNkr: ["EvrakNo", "RaporNo"], ProformaBaslik: ["EvrakNo"] };
const clean = value => String(value ?? "").trim();
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rows = async (sql, params = []) => (await db.query(sql, params))[0];

async function inspect() {
  const [invoices, payments, ozelLinks, kdLinks, kdDocs, nkr, links, proformas, details] = await Promise.all([
    rows("SELECT * FROM Fatura"), rows("SELECT * FROM Odeme"),
    rows("SELECT * FROM EvrakNoMigration2026OzelLink WHERE TableName='Odeme'"),
    rows("SELECT * FROM EvrakNoMigration2026Link WHERE TableName='Odeme'"),
    rows("SELECT * FROM EvrakNoMigration2026Doc"), rows("SELECT ID,Evrak_No,RaporNo,Firma_ID FROM NKR"),
    rows("SELECT * FROM ProformaNkr"), rows("SELECT * FROM ProformaBaslik"), rows("SELECT * FROM FaturaDetay"),
  ]);
  const nkrById = new Map(nkr.map(n => [Number(n.ID), n]));
  const payById = new Map(payments.map(p => [Number(p.ID), p]));
  const historic = new Map();
  for (const l of [...kdLinks, ...ozelLinks]) {
    const p = payById.get(Number(l.RowID));
    if (!p?.Fatura_ID) continue;
    const key = Number(p.Fatura_ID);
    if (!historic.has(key)) historic.set(key, []);
    historic.get(key).push({ old: clean(l.OldEvrakNo), next: clean(p.Evrak_No) });
  }
  const plan = [], issues = [], invoiceMoves = [];
  const add = (table, row, changes, evidence) => {
    const effective = Object.fromEntries(Object.entries(changes).filter(([k,v]) => clean(row[k]) !== clean(v)));
    if (Object.keys(effective).length) plan.push({ table, id: Number(row.ID), changes: effective, evidence, before: row });
  };
  for (const f of invoices) {
    const old = clean(f.ProformaNo);
    if (!/^\d+$/.test(old)) continue; // PRF numbers are not document numbers.
    const anchors = (historic.get(Number(f.ID)) || []).filter(l => l.old === old);
    if (!anchors.length) continue;
    const targets = [...new Set(anchors.map(a => a.next).filter(Boolean))];
    const allPayments = [...new Set(payments.filter(p => Number(p.Fatura_ID) === Number(f.ID)).map(p => clean(p.Evrak_No)).filter(Boolean))];
    let target = targets.length === 1 && allPayments.length === 1 ? targets[0] : null;
    // A mixed Özel/KD invoice remains shared via Fatura_ID; use its KD reference
    // rather than a retired five-digit number now reused by another company.
    const kd = kdDocs.find(d => clean(d.OldEvrakNo) === old);
    if (!target && kd && allPayments.includes(clean(kd.NewEvrakNo)) && allPayments.length <= 2) {
      target = clean(kd.NewEvrakNo);
    }
    if (!target) { issues.push({ kind: "invoice-multiple-targets", id: f.ID, old, targets, allPayments }); continue; }
    if (target === old) continue;
    add("Fatura", f, { ProformaNo: target }, { paymentMigration: anchors, paymentEvraks: allPayments });
    invoiceMoves.push({ id: f.ID, old, target, firma: Number(f.FaturaFirmaID) });
  }
  // Detail rows have no Fatura_ID. Update only when original document + billing
  // company identifies a single target, and no unmoved invoice uses that pair.
  for (const d of details) {
    const matches = invoiceMoves.filter(f => f.old === clean(d.ProformaNo) && f.firma === Number(d.FaturaFirmaID));
    if (!matches.length) continue;
    const targets = [...new Set(matches.map(f => f.target))];
    const others = invoices.filter(f => clean(f.ProformaNo) === clean(d.ProformaNo) && Number(f.FaturaFirmaID) === Number(d.FaturaFirmaID) && !matches.some(m => m.id === f.ID));
    if (targets.length !== 1 || others.length) { issues.push({ kind: "detail-ambiguous", id: d.ID }); continue; }
    add("FaturaDetay", d, { ProformaNo: Number(targets[0]) }, { invoiceIds: matches.map(f => f.id), firma: d.FaturaFirmaID });
  }
  const linksByProforma = new Map();
  for (const l of links) {
    const n = nkrById.get(Number(l.NkrID));
    if (!n) { issues.push({ kind: "missing-numune", id: l.ID, nkrId: l.NkrID }); continue; }
    add("ProformaNkr", l, { EvrakNo: clean(n.Evrak_No), RaporNo: clean(n.RaporNo) }, { nkrId: n.ID });
    if (!linksByProforma.has(Number(l.ProformaID))) linksByProforma.set(Number(l.ProformaID), []);
    linksByProforma.get(Number(l.ProformaID)).push(n);
  }
  for (const p of proformas) {
    const ns = linksByProforma.get(Number(p.ID)) || [];
    if (!ns.length) continue;
    if (ns.some(n => Number(n.Firma_ID) !== Number(p.FirmaID))) {
      issues.push({ kind: "proforma-report-company-mismatch", id: p.ID, firmaId: p.FirmaID, numuneFirmaIds: [...new Set(ns.map(n => n.Firma_ID))] });
      continue;
    }
    const evraks = [...new Set(ns.map(n => clean(n.Evrak_No)).filter(Boolean))];
    if (!evraks.length) continue;
    const target = evraks.length === 1 ? evraks[0] : `Çoklu (${evraks.length} evrak)`;
    add("ProformaBaslik", p, { EvrakNo: target }, { nkrIds: ns.map(n => n.ID), evraks });
    // Billing company can legitimately differ from reporting company. Report
    // this discrepancy, do not mutate either company identity.
  }
  const counts = {};
  for (const p of plan) counts[p.table] = (counts[p.table] || 0) + 1;
  return { plan, issues, counts, invoiceMoves };
}

async function mutate() {
  await db.query(`CREATE TABLE IF NOT EXISTS ${backupTable} (
    TableName VARCHAR(64) NOT NULL, RowID BIGINT NOT NULL, BeforeRow LONGTEXT NOT NULL,
    AfterRow LONGTEXT NOT NULL, BeforeHash CHAR(64) NOT NULL, AfterHash CHAR(64) NOT NULL,
    Evidence LONGTEXT NOT NULL, AppliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    RolledBackAt DATETIME NULL, PRIMARY KEY(TableName, RowID)
  )`);
  await db.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  await db.beginTransaction();
  try {
    if (mode === "rollback") {
      const backups = await rows(`SELECT * FROM ${backupTable} WHERE RolledBackAt IS NULL FOR UPDATE`);
      for (const b of backups) {
        if (!allowed[b.TableName]) throw new Error("Unknown backup table");
        const current = (await rows(`SELECT * FROM ${b.TableName} WHERE ID=? FOR UPDATE`, [b.RowID]))[0];
        if (digest(current) !== b.AfterHash) throw new Error(`Rollback conflict: ${b.TableName}/${b.RowID}`);
        const before = JSON.parse(b.BeforeRow), after = JSON.parse(b.AfterRow);
        const columns = allowed[b.TableName].filter(k => clean(before[k]) !== clean(after[k]));
        await db.query(`UPDATE ${b.TableName} SET ${columns.map(k => `${k}=?`).join(",")} WHERE ID=?`, [...columns.map(k => before[k]), b.RowID]);
        if (digest((await rows(`SELECT * FROM ${b.TableName} WHERE ID=?`, [b.RowID]))[0]) !== b.BeforeHash) throw new Error("Rollback invariant failed");
        await db.query(`UPDATE ${backupTable} SET RolledBackAt=NOW() WHERE TableName=? AND RowID=?`, [b.TableName,b.RowID]);
      }
      await db.commit();
      return { rolledBack: backups.length };
    }
    const result = await inspect();
    const paymentHash = digest(await rows("SELECT * FROM Odeme ORDER BY ID"));
    for (const p of result.plan) {
      const columns = Object.keys(p.changes);
      if (columns.some(k => !allowed[p.table]?.includes(k))) throw new Error("Unsafe column");
      const current = (await rows(`SELECT * FROM ${p.table} WHERE ID=? FOR UPDATE`, [p.id]))[0];
      if (digest(current) !== digest(p.before)) throw new Error(`Concurrent change: ${p.table}/${p.id}`);
      const backups = await rows(`SELECT * FROM ${backupTable} WHERE TableName=? AND RowID=?`, [p.table,p.id]);
      if (backups.length) throw new Error(`Existing backup: ${p.table}/${p.id}`);
      await db.query(`UPDATE ${p.table} SET ${columns.map(k => `${k}=?`).join(",")} WHERE ID=?`, [...columns.map(k => p.changes[k]),p.id]);
      const after = (await rows(`SELECT * FROM ${p.table} WHERE ID=?`, [p.id]))[0];
      const untouched = { ...after };
      for (const k of columns) untouched[k] = p.before[k];
      if (digest(untouched) !== digest(p.before)) throw new Error(`Immutable fields changed: ${p.table}/${p.id}`);
      await db.query(`INSERT INTO ${backupTable} (TableName,RowID,BeforeRow,AfterRow,BeforeHash,AfterHash,Evidence) VALUES (?,?,?,?,?,?,?)`, [p.table,p.id,JSON.stringify(p.before),JSON.stringify(after),digest(p.before),digest(after),JSON.stringify(p.evidence)]);
    }
    if (digest(await rows("SELECT * FROM Odeme ORDER BY ID")) !== paymentHash) throw new Error("Payment data changed");
    const verified = await inspect();
    if (verified.plan.length) throw new Error("Reference verification failed");
    await db.commit();
    return { applied: result.counts, issues: result.issues, paymentDataUnchanged: true, remainingRepairs: 0 };
  } catch (e) { await db.rollback(); throw e; }
}

try {
  if (mode === "audit") {
    const r = await inspect();
    console.log(JSON.stringify({ counts: r.counts, invoiceMoves: process.argv.includes("--verbose") ? r.invoiceMoves : r.invoiceMoves.filter(f => f.old === "26123"), issues: r.issues }, null, 2));
  } else console.log(JSON.stringify(await mutate(), null, 2));
} finally { await db.end(); }
