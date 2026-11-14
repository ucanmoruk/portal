import { MethodDefinitionWizard } from "@/components/validation/MethodDefinitionWizard";
export const metadata={title:"Unique - Yeni Validasyon"};
export default async function Page({searchParams}:{searchParams:Promise<{edit?:string}>}){const p=await searchParams;return <div><h1>Unique · Validasyon / Verifikasyon</h1><MethodDefinitionWizard editId={p.edit}/></div>}
