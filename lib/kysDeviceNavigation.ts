export const DEVICE_PROCEDURE_PAGES = [
  { module:'cihaz-listesi', label:'Cihaz Listesi', menuKey:'laboratuvar.kys.cihaz-listesi' },
  { module:'kalibrasyon-kontrol', label:'Kalibrasyon ve Ara Kontrol', menuKey:'laboratuvar.kys.kalibrasyon-kontrol' },
  { module:'cihaz-kalibrasyon-sartname', label:'Teknik Şartname', menuKey:'laboratuvar.kys.cihaz-listesi' },
  { module:'cihaz-bakim-sartlari', label:'Performans Bakım', menuKey:'laboratuvar.kys.cihaz-listesi' },
] as const;
export const DEVICE_CARD_MODULES = ['cihaz-islemleri','kalibrasyon-belirsizlikleri'];
export function isDeviceWorkspace(module:string) { return DEVICE_PROCEDURE_PAGES.some(p=>p.module===module)||DEVICE_CARD_MODULES.includes(module); }
export function isDeviceProcedurePath(path:string) { return [...DEVICE_PROCEDURE_PAGES.map(p=>p.module),...DEVICE_CARD_MODULES].some(m=>path===`/laboratuvar/kys/${m}`||path.startsWith(`/laboratuvar/kys/${m}/`)); }
