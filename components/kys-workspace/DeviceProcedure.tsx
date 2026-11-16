'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { WorkspaceRecord } from '@/lib/kysWorkspaceConfig';
import { deviceOperationHistory } from '@/lib/kysDeviceProcedure';
import s from './Workspace.module.css';
import table from '@/app/styles/table.module.css';
const date=(v?:string)=>v?v.slice(0,10).split('-').reverse().join('.'):'—';
export default function DeviceProcedure({rows,showHistory=true,onOpen}:{rows:WorkspaceRecord[];showHistory?:boolean;onOpen?:(module:string,id:string)=>void}) {
  const [showPassive,setShowPassive]=useState(false);
  const maintenance=rows.filter(r=>r.module==='cihaz-bakim-sartlari'&&r.status==='Aktif');
  const specs=rows.filter(r=>r.module==='cihaz-kalibrasyon-sartname'&&r.status==='Aktif');
  const history=deviceOperationHistory(rows).filter(r=>showPassive||r.status!=='Pasif Eski Kayıt');
  const latest=new Map<string,WorkspaceRecord>();
  for(const row of deviceOperationHistory(rows))if(!['Pasif Eski Kayıt','İptal'].includes(row.status)) {
    const kind=row.data.kind||row.data.operation;if(!latest.has(kind))latest.set(kind,row);
  }
  return <>
    <section className={`${s.card} ${s.section}`}><h2 className={s.title}>Performans ve Bakım Şartları</h2>
      {!maintenance.length?<p className={s.muted}>Bakım veya performans kontrol şartı tanımlanmamış.</p>:maintenance.map(row=><div className={s.procedureBlock} key={row.id}><dl className={s.detail}>
        {[['Performans kontrol sıklığı',row.data.performanceFrequency],['Kontrol detayı',row.data.performanceDetail],['Bakım sıklığı',row.data.maintenanceFrequency],['Bakım detayı',row.data.maintenanceDetail]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value||'—'}</dd></div>)}
      </dl>{onOpen?<button className={s.codeButton} onClick={()=>onOpen(row.module,row.id)}>Şart kaydını aç</button>:<Link href={`/laboratuvar/kys/${row.module}/${row.id}`}>Şart kaydını aç</Link>}</div>)}
    </section>
    <section className={`${s.card} ${s.section}`}><h2 className={s.title}>Kalibrasyon Noktaları ve Kabul Kriterleri</h2>
      {!specs.length?<p className={s.muted}>Kalibrasyon şartnamesi tanımlanmamış.</p>:specs.map(row=><div className={s.procedureBlock} key={row.id}><dl className={s.detail}>
        {[['Kalibrasyon tipi',row.data.type],['Kalibrasyon sıklığı',row.data.frequency],['Ara kontrol sıklığı',row.data.intermediateFrequency],['Çalışma aralığı',row.data.range],['Kalibrasyon noktaları / aralığı',row.data.points],['Kabul kriteri',row.data.criteria],['Kaynak',row.data.reference]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value||'—'}</dd></div>)}
      </dl>{onOpen?<button className={s.codeButton} onClick={()=>onOpen(row.module,row.id)}>Şartnameyi aç</button>:<Link href={`/laboratuvar/kys/${row.module}/${row.id}`}>Şartnameyi aç</Link>}</div>)}
    </section>
    <section className={`${s.card} ${s.section}`}><h2 className={s.title}>Son Uygulamalar ve Planlanan Tarihler</h2>
      <div className={table.tableWrapper}><table className={`${table.table} ${s.fittedTable}`}><thead><tr><th>İşlem</th><th>Son uygulama</th><th>Sonraki tarih</th><th>Uygulayan</th></tr></thead><tbody>
        {[...latest].map(([kind,row])=><tr key={kind}><td data-label="İşlem">{kind}</td><td data-label="Son uygulama">{date(row.data.performedAt||row.data.date)}</td><td data-label="Sonraki tarih">{date(row.data.nextDate)}</td><td data-label="Uygulayan">{row.data.provider||row.data.owner||'—'}</td></tr>)}
        {!latest.size?<tr><td colSpan={4}>Uygulama kaydı bulunmuyor.</td></tr>:null}
      </tbody></table></div>
    </section>
    {showHistory && <section className={`${s.card} ${s.section}`}><div className={s.toolbar}><h2 className={s.title}>Cihaz İşlem Geçmişi</h2><label><input type="checkbox" checked={showPassive} onChange={e=>setShowPassive(e.target.checked)}/> Pasif eski kayıtları göster</label></div>
      <div className={table.tableWrapper}><table className={`${table.table} ${s.fittedTable}`}><thead><tr><th>İşlem türü</th><th>Tarih</th><th>Sonraki tarih</th><th>Açıklama / Sonuç</th><th>Uygulayan</th><th>Belge adı</th><th>Kayıt durumu</th><th>İşlem</th></tr></thead><tbody>
        {history.map(row=><tr key={row.id}><td>{row.data.kind||row.data.operation}</td><td>{date(row.data.performedAt||row.data.date)}</td><td>{date(row.data.nextDate)}</td><td className={s.procedureText}>{row.data.description||row.data.evaluation||'—'}</td><td>{row.data.provider||row.data.owner||'—'}</td><td className={s.procedureText}>{row.data.legacyDocument||row.data.certificate||'—'}</td><td>{row.status}</td><td>{onOpen?<button className={s.codeButton} onClick={()=>onOpen(row.module,row.id)}>Detay</button>:<Link href={`/laboratuvar/kys/${row.module}/${row.id}`}>Detay</Link>}</td></tr>)}
        {!history.length?<tr><td colSpan={8}>İşlem kaydı bulunmuyor.</td></tr>:null}
      </tbody></table></div>
      <p className={s.muted}>Aktarılan kayıtların işlem tarihi, açıklaması ve uygulayan bilgisi eski sistemden gelir. Belge adı, dosyanın portala yüklendiği anlamına gelmez. İşlem bazında kalibrasyon tipi bağlantısı bulunmadığı için ölçüm noktaları cihaz şartnamesinde ayrı gösterilir.</p>
    </section>}
  </>;
}
