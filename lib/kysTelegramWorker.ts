import { loadDotenvOnce } from "@/lib/loadDotenv";
import { runTelegramDigests } from "@/lib/kysTelegramStore";
const state=globalThis as typeof globalThis&{kysTelegramTimer?:ReturnType<typeof setInterval>};
export function startKysTelegramWorker(){
  if(state.kysTelegramTimer)return;
  let busy=false;
  const tick=async()=>{
    loadDotenvOnce();
    if(busy||process.env.KYS_TELEGRAM_ENABLED!=="true")return;
    busy=true;
    try{await runTelegramDigests();}catch{console.error("[kys-telegram] Bildirim görevi tamamlanamadı; veritabanı ve Telegram ayarlarını kontrol edin.");}finally{busy=false;}
  };
  state.kysTelegramTimer=setInterval(()=>void tick(),5*60000);state.kysTelegramTimer.unref();
  setTimeout(()=>void tick(),10000).unref();
}
