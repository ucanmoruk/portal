import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import WorkspaceClient from '@/components/kys-workspace/WorkspaceClient';
import { workspaceAccess } from '@/lib/kysWorkspaceAccess';
export default async function Page({params}:{params:Promise<{recordId:string}>}){const access=await workspaceAccess('cihaz-kalibrasyon-sartname');if(!access)redirect('/login');if(!access.view)notFound();const {recordId}=await params;return <Suspense fallback={<p>Yükleniyor…</p>}><WorkspaceClient module="cihaz-kalibrasyon-sartname" recordId={recordId}/></Suspense>;}
