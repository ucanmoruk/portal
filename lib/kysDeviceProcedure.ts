import type { WorkspaceRecord } from './kysWorkspaceConfig';
export function latestDeviceCalibrations(rows: WorkspaceRecord[]) {
  const map=new Map<string,WorkspaceRecord>();
  for(const row of rows) {
    if(row.module!=='kalibrasyon-kontrol'||row.data.kind!=='Kalibrasyon'||!['Uygun','Aktarıldı'].includes(row.status)||!row.data.performedAt)continue;
    const previous=map.get(row.data.deviceId);
    if(!previous||row.data.performedAt>previous.data.performedAt||(row.data.performedAt===previous.data.performedAt&&(row.source?.id??0)>(previous.source?.id??0)))map.set(row.data.deviceId,row);
  }
  return map;
}
export function deviceOperationHistory(rows:WorkspaceRecord[]) {
  return rows.filter(r=>['kalibrasyon-kontrol','cihaz-islemleri'].includes(r.module)).sort((a,b)=>(b.data.performedAt||b.data.date||'').localeCompare(a.data.performedAt||a.data.date||'')||(b.source?.id??0)-(a.source?.id??0));
}
