import { spektrotekJson } from "@/lib/spektrotekHttp";
import { SpektrotekTalepBatch } from "@/lib/spektrotekTalepRules";
import { upsertSpektrotekTalepler } from "@/lib/spektrotekTalep";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  return spektrotekJson(request,async body=>{const {talepler}=SpektrotekTalepBatch.parse(body);return {ok:true,...await upsertSpektrotekTalepler(talepler)};});
}
